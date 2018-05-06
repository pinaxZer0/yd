'use strict';
var TableBase=require('./tablebase.js');
var async=require('async'), merge=require('gy-merge'), clone=require('clone');
var Game=require('./gamerule');
var debugout=require('debugout')(require('yargs').argv.debugout);
var _=require('lodash'), once=require('once');
var getDB=require('../db.js'), g_db=null;
getDB(function(err, db) {
	if (!err) g_db=db;
});
var initSrvStat=require('../servers.js'),srv_state={};
initSrvStat(function(err, s) {
	if (!err) srv_state=s;
})

const GAME_STATUS={
	KAIJU:1,
	FAPAI:2,
	JIESUAN:3,
	QIEPAI:5,
};
class Baijiale extends TableBase {
	constructor(roomid, type, opt) {
		super(roomid, type, opt);
		this.roomid=roomid;
		this.profits=[];
		this.profits.sum=0;
		// this._quitList=[];
		this.roomtype='baccarat';
		this.gamedata.opt=merge({minZhu:10, maxZhu:7500, minDui:1, maxDui:750, maxHe:950}, opt);
		this.opt=this.gamedata.opt;
		this.gamedata.roomid=roomid;
		this.gamedata.his=[];
		this.gamedata.seats={};
		var game=this.gamedata.game=new Game();
		var self=this;
		game.on('burn', function(detail) {
			self.broadcast({c:'table.baccarat.burn', detail});
		})
		.on('result', function(detail) {
			debugout('set', self.gamedata.setnum, detail, '@', new Date());
			detail.playerCard=game.player.cards;
			detail.bankerCard=game.banker.cards;
			self.gamedata.his.push(detail);
		});

		this.msgDispatcher.on('userquit', this.countOnline.bind(this));
		this.run();
	}
	countOnline() {
		this.gamedata.online=Object.keys(this.gamedata.seats).length;
	}
	get onlineCount() {
		return this.gamedata.online;
	}
	tryAutoDismiss() {}
	canEnter(user) {
		return true;
	}
	leave(user) {
		// this.broadcast({c:'table.userout', id:user.id});
		// if (this.gamedata.playerBanker==user) this.playerBankerWantQuit=user.id;
		this.msgDispatcher.emit('userleave', user);
		this.quit(user);
	}
	enter(user) {
		if (this.quitTimer) clearTimeout(this.quitTimer);
		var seat=null, gd=this.gamedata;

		if (!gd.seats[user.id]) {
			gd.seats[user.id]={user:user}; 
			this.countOnline();
		}
		// 下注重入
		if (gd.deal && gd.deal[user.id] && gd.deal[user.id].user) {
			debugout('user in&rein'.cyan, gd.deal[user.id].user.coins);
			user.coins=gd.deal[user.id].user.coins;
			gd.deal[user.id].user=user;
		}
		
		var o=this.mk_transfer_gamedata(this.gamedata);
		var gamedata=o.gamedata||o.scene;
		gamedata.$={init:true};
		o.seq=1;
		user.send(o);
		this.broadcast({c:'table.userin', id:user.id, nickname:user.nickname, level:user.level, face:user.dbuser.face, seat:seat});
		user.offline=false;
		this.msgDispatcher.emit('userin', user);
		// if (emptyseat==1) this.run();		
	}
	// quit(user) {
	// 	this._quitList.push(user);
	// }
	mk_transfer_gamedata(obj, idx) {
		// 简化user对象，只传输id nickname face level score
		//console.log(JSON.stringify(obj));
		var self = this;
		if (!obj.deal && !obj.seats) return {scene:obj};
		obj=clone(obj);
		if (obj.deal) {
			for (var i in obj.deal) {
				delete obj.deal[i].user;
			}
		}
		if (obj.seats) {
			for (var i in obj.seats) {
				var seat =obj.seats[i];
				if (!seat) continue;
				var u=this.scene.seats[i].user;
				if (u) {
					seat.user={id:u.id, nickname:u.nickname, face:u.dbuser.face, coins:u.coins, level:u.level, offline:seat.offline};
				}
			}
		}
		return {scene:obj};
	}
	newgame() {
		debugout(this.gamedata.roomid, 'new game');
		this.gamedata.setnum=0;
		this.gamedata.his=[];
		this.q.push(this.qiepai.bind(this));
		this.newround();
	}
	newround() {
		debugout(this.gamedata.roomid, 'new round');
		this.q.push([
			this.waitXiazhu.bind(this),
			this.fapai.bind(this),
			this.jiesuan.bind(this)
		]);
	}
	run() {
		var self = this;
		// loop
		this.q = async.queue(function(task, cb) {
			if (typeof task=='function') return task(cb);
			cb();
		});

		this.q.push([
			this.waitUserEnter.bind(this),
		],function(err) {

		});
		this.newgame();
	}
	waitUserEnter(cb) {
		var _cb=once(cb);
		this.msgDispatcher.once('userin', function() {
			_cb();
		});
		setTimeout(_cb, 20000+Math.random()*40000);
	}
	qiepai(cb) {
		debugout(this.roomid, 'qiepai');
		// 找到所有在线的玩家，随机选一个人来切牌
		var self=this;
		this.gamedata.status=GAME_STATUS.QIEPAI;
		var vus=this.allusers(true);
		var choose=Math.floor(Math.random()*vus.length);
		debugout(vus, choose);
		var u=vus[choose];
		if (!u) {
			self.gamedata.game.begin();
			return cb();
		}
		u.createInteract({c:'table.waitQiepai'}, {times:1, timeout:5})
		.on('ans', function(pack) {
			self.broadcast(pack, vus[choose]);
		})
		.on('final', function() {
			self.gamedata.game.begin();
			cb();
		});
	}
	waitXiazhu(callback) {
		debugout(this.roomid, 'waitXiazhu');
		var self=this, gd=this.gamedata;
		this.gamedata.status=GAME_STATUS.KAIJU;
		// var vus=this.allusers(true);
		gd.deal={};
		var total={xian:0, xianDui:0, zhuang:0, zhuangDui:0, he:0};
		function handleXiazhu(pack, user) {
			var deal=gd.deal[user.id];
			if (!deal) {
				gd.deal[user.id]={xianDui:0, zhuangDui:0, he:0, xian:0, zhuang:0, user:user, orgCoins:user.coins};
				deal=gd.deal[user.id];
			}
			if (deal.sealed) return;
			// var userTotal=deal.xian+deal.zhuang+deal.xianDui+deal.zhuangDui+deal.he;
			var curDeal=(pack.xian||0)+(pack.zhuang||0)+(pack.xianDui||0)+(pack.zhuangDui||0)+(pack.he||0);
			// var total_deal=curDeal+userTotal;
			if (curDeal>user.coins) return user.send({err:{message:'资金不足，请充值', win:'RechargeWin', askUser:true}});

			debugout(pack, total);
			if (pack.xian) {
				if (pack.xian<gd.opt.minZhu) return user.send({err:'最少下注'+gd.opt.minZhu});
				if ((pack.xian+deal.xian)>gd.opt.maxZhu) return user.send({err:'最多下注'+gd.opt.maxZhu});
				deal.xian+=pack.xian;
				total.xian+=pack.xian;
				user.coins-=pack.xian;
			}
			else if (pack.zhuang) {
				if (pack.zhuang<gd.opt.minZhu) return user.send({err:'最少下注'+gd.opt.minZhu});
				if ((pack.zhuang+deal.zhaung)>gd.opt.maxZhu) return user.send({err:'最多下注'+gd.opt.maxZhu});
				deal.zhuang+=pack.zhuang;
				total.zhuang+=pack.zhuang;
				user.coins-=pack.zhuang;
			}
			else if (pack.he) {
				if (pack.he<gd.opt.minDui) return user.send({err:'最少下注'+gd.opt.minDui});
				if ((deal.he+pack.he)>gd.opt.maxHe) return user.send({err:'最多下注'+gd.opt.maxHe});
				deal.he+=pack.he;
				total.he+=pack.he;
				user.coins-=pack.he;
			}
			else if (pack.xianDui) {
				if (pack.xianDui<gd.opt.minDui) return user.send({err:'最少下注'+gd.opt.minDui});
				if ((deal.xianDui+pack.xianDui)>gd.opt.maxDui) user.send({err:'最多下注'+gd.opt.maxDui});
				deal.xianDui+=pack.xianDui;
				total.xianDui+=pack.xianDui;
				user.coins-=pack.xianDui;
			}
			else if (pack.zhuangDui) {
				if (pack.zhuangDui<gd.opt.minDui) return user.send({err:'最少下注'+gd.opt.minDui});
				if ((pack.zhuangDui+deal.zhuangDui)>gd.opt.maxDui) user.send({err:'最多下注'+gd.opt.maxDui});
				deal.zhuangDui+=pack.zhuangDui;
				total.zhuangDui+=pack.zhuangDui;
				user.coins-=pack.zhuangDui;
			}
			// write to db
			var op={};
			op['xiazhu.'+user.id]={xian:deal.xian, zhuang:deal.zhuang, he:deal.he, xianDui:deal.xianDui, zhuangDui:deal.zhuangDui};
			g_db.servers.updateOne({_id:self.roomid}, {$set:op}, function(err) {if (err) debugout(err.toString().cyan)});
		}
		function handleCancelXiazhu(pack, user) {
			var deal=gd.deal[user.id];
			if (!deal) return;
			if (deal.sealed) return;
			total.xianDui-=deal.xianDui;
			total.zhuangDui-=deal.zhuangDui;
			total.he-=deal.he;
			total.xian-=deal.xian;
			total.zhuang-=deal.zhuang;
			var reback=(deal.xian||0)+(deal.xianDui||0)+(deal.zhuangDui||0)+(deal.he||0)+(deal.zhuang||0);
			deal.user.coins+=reback;
			deal.xian=deal.xianDui=deal.zhuangDui=deal.he=deal.zhuang=0;
			var op={};
			op['xiazhu.'+user.id]='';
			g_db.servers.update({_id:this.roomid}, {$unset:op});
			// delete gd.deal[user.id];
		}
		function handleConfirmXiazhu(pack, user) {
			var deal=gd.deal[user.id];
			if (!deal) return;
			deal.sealed=true;
		}
		gd.countdown=24;
		var timer=setInterval(function() {
			gd.countdown--;
			if (gd.countdown==-1) {
				clearInterval(timer);
				self.msgDispatcher.removeListener('table.xiazhu',handleXiazhu)
				.removeListener('table.cancelXiazhu',handleCancelXiazhu)
				.removeListener('table.confirmXiazhu',handleConfirmXiazhu);
				callback();
			}
		}, 1000);
		this.msgDispatcher.on('table.xiazhu', handleXiazhu)
		.on('table.cancelXiazhu', handleCancelXiazhu)
		.on('table.confirmXiazhu', handleConfirmXiazhu)
	}
	fapai(cb) {
		this.gamedata.status=GAME_STATUS.FAPAI;
		this.gamedata.game.once('result', function() {
			setTimeout(function() {cb()}, 100);
		});
		this.gamedata.game.playHand();
	}
	jiesuan(cb) {
		debugout(this.roomid, 'jiesuan');
		this.gamedata.status=GAME_STATUS.JIESUAN;
		var profit=0;
		var factor={xian:2, zhuang:1.95, xianDui:12, zhuangDui:12, he:9};
		var self=this, gd=this.gamedata;
		// clear servers temp data
		g_db.servers.update({_id:self.roomid}, {$unset:{'xiazhu':''}});
		var r=gd.his[gd.his.length-1];
		var winArr=[], loseArr, tieArr=[];
		if (r.win=='tie') {
			winArr.push('he');
			tieArr=['zhuang', 'xian'];
		} else {
			if (r.win=='banker') {
				winArr.push('zhuang');
			}
			if (r.win=='player') {
				winArr.push('xian');
			}
			if (r.playerPair) {
				winArr.push('xianDui');
			}
			if (r.bankerPair) {
				winArr.push('zhuangDui');
			}
		}
		var params=winArr.concat(tieArr);
		params.unshift(['zhuang', 'xian', 'he', 'xianDui', 'zhuangDui']);
		loseArr=_.without.apply(_, params);

		var now=new Date();
		var profit=0, water=0;
		var updObj={seats:{}};
		var user_win_list=[];
		for (var k in gd.deal) {
			var deal=gd.deal[k];
			var total_deal=0;
			['zhuang', 'xian', 'he', 'xianDui', 'zhuangDui'].forEach(function(sect) {
				if (deal[sect]) total_deal+=deal[sect];
			});
			updObj.seats[k]={user:deal.user};
			// var orgCoins=deal.user.coins;
			var userwin=0, userlose=0, usertie=0;
			for (var i=0;i<winArr.length; i++) {
				var usercoins=deal[winArr[i]]
				if (!usercoins) continue;
				// 玩家赢钱
				var delta=usercoins*factor[winArr[i]];
				userwin+=delta;
				// var delta=usercoins*factor[winArr[i]], d=Math.round(delta*waterRatio);
				// water+=(delta-d);
				// userprofit+=d;
				// deal.user.coins+=(d+usercoins);
				// 绕过自动的coins同步，客户端的status是按照顺序播放的，而默认的coins是无顺序的，这会导致交叉
				// deal.user.coins+=d;
				// finaldelta+=d;
				// modifyUserCoins(deal.user, d);
				profit-=delta;
				debugout('player win(id, qu, wins)', deal.user.id, winArr[i], delta);
			}
			for (var i=0; i<tieArr.length; i++) {
				var usercoins=deal[tieArr[i]]
				if (!usercoins) continue;
				usertie+=usercoins;
			}
			for (var i=0; i<loseArr.length; i++) {
				var usercoins=deal[loseArr[i]];
				if (!usercoins) continue;
				// deal.user.coins-=usercoins;
				// finaldelta-=usercoins;
				userlose+=usercoins;
				profit+=usercoins;
			}
			// for (var i=0; i<tieArr.length; i++) {
			// 	deal.user.coins+=deal[tieArr[i]];
			// }
			// deal.user.setprofit=userprofit;

			// deal.user.send({c:'setprofit', p:userprofit});
			// modifyUserCoins(deal.user, finaldelta);
			var u=deal.user;
			// deal.user=undefined;
			user_win_list.push({user:u, deal:deal, win:userwin, tie:usertie, lose:userlose});
		}
		for (var i=0; i<user_win_list.length; i++) {
			var obj=user_win_list[i];
			var delta=0;
			if (obj.win>0) {
				delta+=obj.win;
			}
			if (obj.tie>0) delta+=obj.tie;
			var u=obj.deal.user;
			obj.deal.user=undefined;
			modifyUserCoins(obj.user, delta);
			var newCoins=obj.user.coins;
			debugout('user', obj.user.id, 'score chgd', delta, obj.user.coins);
			g_db.games.insertOne({user:obj.user.id, deal:obj.deal, r:r, oldCoins:obj.deal.orgCoins, newCoins:newCoins, t:now}, function(err, r) {
				debugout(err, r);
			});
			obj.deal.user=u;
		}
		this.profits.push({profit:profit, t:now, set:gd.setnum});
		this.profits.sum+=profit;
		srv_state.total_profit+=profit;

		gd.setnum++;
		for (var i in updObj.seats) {
			var seat=gd.seats[i];
			if (seat) {
				if (seat.user) {
					if (!seat.user.dbuser.total_set) seat.user.dbuser.total_set=1;
					else seat.user.dbuser.total_set++;
				}
				var o=self.mk_transfer_gamedata(updObj, i);
				o.seq=1;
				o.jiesuan=true;
				// seat.user.send(o);
			}
		}
		(function(next) {
			if (self.allusers().length==0) {
				debugout(self.roomid, 'no enough user');
				// wait user enter to continue OR timeout
				var _next=once(function() {next()});
				self.msgDispatcher.once('userin', _next);
				setTimeout(function() {
					self.msgDispatcher.removeListener('userin', _next);
					_next();
				}, 20000+Math.random()*40000);
			}
			else next();
		})(function() {
			if (gd.game.leftCards<14) {
			// if (gd.setnum>=3) {
				self.newgame();
			}else self.newround();
			var delay=1800;
			if (gd.game.player.cards.length==2) delay+=1200;
			else delay+=1800;
			if (gd.game.banker.cards.length==2) delay+=1200;
			else delay+=1800;
			delay+=1500;
			if (r.playerPair) delay+=1300; //pairs
			if (r.bankerPair) delay+=1300;
			delay+=500; //take coin
			delay+=500; //give coins;
			delay+=500; //to player
			delay+=4000;
			setTimeout(cb, delay);
		});
	}
	safeStop(cb) {
		if (this.allusers().length==0 && (!this.gamedata.deal || Object.keys(this.gamedata.deal).length==0)) return cb();
		var self=this;
		function prepareQuit(next) {
			self.broadcast({c:'table.chat', role:'系统', str:'本局结束后将进行停机维护\r\n您可能会看见屏幕闪烁，或者断线提示\r\n请勿担心，10秒之后我们就会恢复服务'});
			process.nextTick(function() {
				self.q.push(function() {
					// stoped
					cb();
				});
			});
			next && next();
		}
		if (this.gamedata.status==GAME_STATUS.JIESUAN) this.q.unshift(prepareQuit)
		else prepareQuit();
	}
}
function modifyUserCoins(user, delta) {
	user.dbuser.coins+=delta;
	user.send({user:{coins:user.dbuser.coins}, seq:1});
}

module.exports=Baijiale;
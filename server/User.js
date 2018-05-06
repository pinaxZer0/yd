'use strict';
var onlineUsers=require('./online.js'), ss=require('./ss.js'), EventEmitter=require('events')
var tables=require('./tables.js'), onlineUsers=require('./online.js');
var filterObj=require('filter-object'), async=require('async');
var getDB=require('./db.js');
var printf=require('printf'), merge=require('gy-merge');
var randstring=require('randomstring').generate;
var ObjectID = require('mongodb').ObjectID;
var debugout=require('debugout')(require('yargs').argv.debugout);
var alltables=require('./tables.js');
var args=require('yargs')
	.boolean('debugout')
	.argv;
var conf={room:{}};

// 此处修改修改成你的内容
var default_user={
	coins:0, savedMoney:0, level:1, face:'ui://6f69ijynsmakpw', tickets:1, friends:[]
};

function getDbuser(userid, proj, cb) {
	User.fromID(userid, proj, function(err, u) {
		if (err) return cb(err);
		cb(null, u.dbuser);
	})
}

var supportedPms=[{name:'hepayItem', pr:1}, {name:'appleStorePayItem', pr:0}, {name:'defaultPaymentItem', pr:0}];
supportedPms.push({name:'iosApplyPaymentItem', pr:false});
if (args.debugout) supportedPms.push({name:'debugpaymentItem', pr:false});
function updatePms(r) {
	for (var i=0; i<supportedPms.length; i++) {
		if (r[supportedPms[i].name]!=null) supportedPms[i].pr=r[supportedPms[i].name];
		else {
			if (supportedPms[i].name=='debugpaymentItem' || supportedPms[i].name=='iosApplyPaymentItem') {
				supportedPms[i].pr=false;
			}
		}
	}
}
function isAppleStoreSupported() {
	for (var i=0; i<supportedPms.length; i++) {
		if (supportedPms[i].name=='iosApplyPaymentItem' && supportedPms[i].pr) return true;
		if (supportedPms[i].name=='appleStorePayItem' && supportedPms[i].pr>0) return true;
	}
	return false;
}
getDB(function(err, db) {
	db.payment.find({_id:'0'}).toArray(function(err, r) {
		if (err ||r.length==0) return;
		updatePms(r[0]);
	})
})

// 此处修改修改成你的内容
var pack_define={
	'imme':{want:{tickets:3}, rmb:0},
	// '5Tickets':{want:{tickets:5, outlay_exp:15}, rmb:10},
	'20Tickets':{want:{tickets:20, outlay_exp:20}, rmb:20},
	'50Tickets':{want:{tickets:50, outlay_exp:50}, rmb:50},
	'150Tickets':{want:{tickets:150, outlay_exp:150}, rmb:150},
	'monthlyTickets':{want:{freeExpire:30*24*60*60*1000,outlay_exp:400}, rmb:400},
	'firstCash':{want:{freeExpire:12*60*60*1000}, rmb:0},
	'weeklyTickets':{want:{freeExpire:7*24*60*60*1000, outlay_exp:99}, rmb:99},	
};
function toProj(arr) {
	var p={};
	for (var i=0; i<arr.length; i++) {
		var key=arr[i];
		if (key[0]=='!') p[key.slice(1)]=0;
		else p[key]=1;
	}
	return p;
}
// 此处修改修改成你的内容
var lvdef=[0, 30, 60, 120, 240, 480, 960, 1920, 3840, 7680, 15360, 30720, 61440, 122880];
class Interact extends EventEmitter {
	constructor(user, opt) {
		super();
		this.__ob=true;		//prevent syncfy-obj from observation me! 
		this.user=user;
		this.clientAckTimes=0;
		this.opt=opt||{};
		this.opt.times=this.opt.times||1;
		this.handler=this.clientAck.bind(this);
		this.user.on('ans', this.handler);
		this.backHandler=this.back.bind(this);
		this.user.on('backOnline', this.backHandler);
		if (opt.timeout) setTimeout(this.finally.bind(this), opt.timeout);
	}
	back() {
		if (this.cmd) this.user.send(this.cmd);
	}
	clientAck(pack) {
		if (this.opt.ans && pack.c!=this.opt.ans) return this.emit('other', pack);
		this.clientAckTimes++;
		this.storedAck=pack;
		this.emit('ans', pack);
		if (this.opt.times>0 && this.clientAckTimes>=this.opt.times) this.finally();
	}
	finally() {
		if (this.finalCalled) return;
		this.finalCalled=true;
		this.emit('final', this.storedAck);
		this.removeAllListeners();
		this.user.removeListener('ans', this.handler);
		this.user.removeListener('backOnline', this.backHandler);
	}
	serverAct(cmd) {
		this.cmd=cmd;
		this.user.send(cmd);
		return this;
	}
};

class User extends EventEmitter {
	constructor(ws, dbuser) {
		super();
		this.__ob=true;
		this.dbuser=dbuser;
		this.table=null;
		this.ws=ws;
		dbuser.loginTime=dbuser.timelygift_taken_time=new Date();
		this.exp=this.exp;

		ss('userin', {userid:this.dbuser._id, nick:this.dbuser.nickname});
	};
	static get payments() {
		return supportedPms;
	}
	static get pack_define() {return pack_define;}
	static get default_user() {return default_user;}
	
	static fromID(userid, proj, cb) {
		if (typeof proj==='function') {
			cb=proj;
			proj=null;
		}
		if (typeof userid=='string') {
			var user=onlineUsers.get(userid);
			if (user) return cb(null, user);
		}
		getDB(function(err, db, easym) {
			easym.createDbJson(db, {col:db.users, key:userid, default:default_user,projection:proj}, function(err, dbu) {
				if (err) return cb(err);
				cb(null, new User({sendp:function(){}}, dbu));
			});
		})
	}
	static fromShowID(id, proj, cb) {
		if (typeof proj==='function') {
			cb=proj;
			proj=null;
		}
		getDB(function(err, db, easym) {
			db.users.find({showId:id}, {_id:true}).limit(1).next(function (err, user) {
				if (err) return cb(err);
				if (!user) return cb('no such user');
				return User.fromID(user._id, proj, cb);
			});
		})
	}

	fixlevel() {
		var n=this.exp;
		for (var i=lvdef.length-1;i>=0; i--) {
			if (n>=lvdef[i]) {
				this.level=i+1;
				return;
			}
		}
		this.level=1;
	}
	pack() {
		var o=clone(this.dbuser);
		delete o.pwd; delete o.password;
		return o;
	}
	send(msg) {return this.ws && this.ws.sendp(msg);}
	senderr(e) {return this.send({err:e})}
	err(e) {return this.senderr(e)}
	// close(msg) {
	// 	if (!msg) msg={c:'kick', reason:'账号在其他地方登录了'};
	// 	this.send(msg);
	// 	this.ws.close();
	// }
	backOnline() {
		this.offline=false;
		this.emit('backOnline', this);
	}
	quit() {
		if (this.table && this.table.leave) this.table.leave(this);
		this.offline=true;
		this.emit('out', this);
	}
	/**
	 * 
	 * @param {*} cmd 
	 * @param {*} timeoutOrOpt 
	 */
	createInteract(cmd, timeoutOrOpt) {
		return new Interact(this, timeoutOrOpt).serverAct(cmd);
	}
	interact(cmd, timeout, cb) {
		if (typeof timeout=='function') {
			cb=timeout;
			timeout=null;
		}

		var _cb=cb, ansHandler, boHandler;
		cb=once(function(err, pack) {
			this.removeListener('backOnline', boHandler);
			this.removeListener('ans', ansHandler);
			_cb.apply(null, arguments);
		});
		if (timeout) setTimeout(function() {
			cb('timeout');
		}, timeout);
		cmd.seq=1;
		this.send(cmd);
		ansHandler=function(pack) {
			cb(null, pack);
		}
		boHandler=function() {
			this.send(cmd);
		}
		this.on('backOnline', boHandler);
		this.on('ans', ansHandler);
	}
	copyfrom(u) {
		this.table=u.table;
		this.dbuser=u.dbuser;

		// if (this.table) {
		// 	this.send({c:'showview', v:'game'+this.table.type, id:this.table.type, opt:this.table.opt});
		// 	this.table.enter(this);
		// }
	}

	get id() {
		return this.dbuser._id;
	}
	get nickname() {
		return this.dbuser.nickname||this.dbuser._id;
	}
	set nickname(str) {
		this.dbuser.nickname=str;
		this.send({user:{nickname:str}});
	}
	get face() {
		return this.dbuser.face;
	}
	set face(f) {
		this.dbuser.face=f;
		this.send({user:{face:f}});
	}
	get exp() {
		return this.dbuser.exp||0;
	}
	set exp(n) {
		this.dbuser.exp=n;
		this.send({user:{exp:n}});
		this.fixlevel();
	}
	get level() {
		return this.dbuser.level;
	}
	set level(n) {
		var oldlv=this.dbuser.level||1;
		this.dbuser.level=n;
		//if (oldlv==n) return;
		this.send({user:{level:n, baseexp:lvdef[n-1], nextexp:lvdef[n]}});
		if (oldlv<n) {
			//this.tickets+=(n-oldlv);
			this.storeMail('升级奖励', {tickets:1});
			this.send({notice:'升级赠送'+(n-oldlv)+'张房卡'});
		}
	}
	get tickets() {
		return this.dbuser.tickets;
	}
	set tickets(n) {
		this.dbuser.tickets=n;
		this.send({user:{tickets:n}});
	}
	get table() {
		return this._table;
	}
	set table(tbl) {
		this._table=tbl;
		if (tbl==null) return this.send({user:{table:0}});
		this.send({user:{table:tbl.code}});
	}
	get showId() {
		return this._showId;
	}
	set showId(n) {
		this._showId=n;
		this.send({user:{showId:n}});
	}
	get mailCount() {
		return this._mailCount||0;
	}
	set mailCount(n) {
		this._mailCount=n;
		this.send({user:{mailCount:n}});
	}
	get firstCash() {
		return this.dbuser.firstCash||0;
	}
	set firstCash(n) {
		var oldv=this.dbuser.firstCash||0;
		if (n<oldv) return;
		this.dbuser.firstCash=n;
		this.send({user:{firstCash:n}});
	}
	get	savedMoney() {
		return this.dbuser.savedMoney||0;
	}
	set savedMoney(n) {
		this.dbuser.savedMoney=n;
		this.send({user:{savedMoney:n}});
	}
	get coins() {
		return this.dbuser.coins;
	}
	set coins(n) {
		this.dbuser.coins=n;
		this.send({user:{coins:n}});
	}
	get bank() {
		return this.dbuser.bank;
	}
	set bank (o) {
		this.dbuser.bank=o;
		this.send({user:{bank:o}});
	}
	storeMail(from, content, cb) {
		var self=this;
		g_db.p.mails.insert({to:this.id, from:from, content:content, time:new Date(), used:false}, {w:1}, function() {
			self.mailCount++;
			cb && cb.apply(null, arguments)
		});
	}
	addPackage(packname) {
		var pack=typeof packname=='string'?pack_define[packname]:packname;
		debugout(pack);
		if (!pack) return false;
		if (!pack.name) pack.name=packname;
		var obj=this.dbuser, upd={};
		for (var k in pack.want) {
			switch (k) {
				case 'freeExpire':
					var now=new Date().getTime();
					var start=Math.max(obj.freeExpire||0, now);
					debugout('freeExpire', now, obj.freeExpire, start, pack.want.freeExpire);
					obj.freeExpire=new Date(start+pack.want.freeExpire);
				break;
				default:
					obj[k]+=pack.want[k]; 
			}
			upd[k]=obj[k];
		}
		if (pack.name=='firstCash') this.firstCash=2;
		//console.log(upd);
		this.send({user:upd});
		return true;
	}
	join(code) {
		var tbl=tables.find(code);
		if (!tbl) {
			// 如果原本table有值，那说明他已经在某个桌子上了，不应该去掉原来的桌子，
			//this.table=null;
			if (this.table==null) this.table=null;
			return this.senderr('没有这个桌子号');
		}
		if (this.table && this.table!=tbl) return this.senderr('已经在另外的桌子上');
		if (!tbl.canEnter(this)) return;
		if (tbl.opt.isAA && tbl.opt.fangka>this.tickets) return this.senderr({message:'房卡不足，请购买房卡', win:'BuyTicketsWin'});
		this.table=tbl;
		this.send({c:'showview', v:'game'+tbl.roomtype, id:tbl.roomtype, roomid:tbl.roomid, opt:tbl.opt, seq:1});
		tbl.enter(this);
	}
	backRoom(code) {
		if (!this.table) {
			this.table=null;
			return this.senderr('桌子已经解散了');
		}
		if (this.table.code!=code) {
			debugout(this.table.code, code);
			return this.senderr('桌子号错误，不能进入');
		}
		var tbl=this.table;
		this.send({c:'showview', v:'game'+tbl.roomtype, id:tbl.roomtype, roomid:tbl.roomid, opt:tbl.opt, seq:1});
		tbl.enter(this);
	}
	prepareLeaveTable() {
		var tbl=this.table;
		if (tbl==null) return false;
		this.table=null;
		this.ws.sendp({c:'showview', v:'hall', seq:1});
		if (this.offline) onlineUsers.remove(this);
		return tbl;
	}
	msg(pack) {
		var self=this;
		switch(pack.c) {
			case 'entergame':
				if (pack.opt.fangka>this.tickets) {
					return this.senderr({message:'创建这个房间需要'+pack.opt.fangka+'张房卡，请先购买房卡', win:'BuyTicketsWin'});
				}
				var tbl=tables.availble(pack.roomtype, pack.opt);
				if (!tbl) return this.senderr('没有可用的桌子了');
				if (this.table) return this.send({err:'已经在其他桌子上了'});// && (this.table.quit(this))
				this.table=tbl;
				//console.log(tbl);
				this.send({c:'showview', v:'game'+pack.roomtype, id:pack.roomtype, roomid:tbl.roomid, opt:pack.opt, seq:1});
				tbl.enter(this);
			break;
			case 'leavegame':
				var tbl=self.table;//self.prepareLeaveTable();
				if (!tbl) return this.send({err:'不在任何桌子上'});
				tbl.leave(this);
				this.ws.sendp({c:'showview', v:'hall', seq:false});
			break;
			case 'quitgame':
				var tbl=self.table;//self.prepareLeaveTable();
				if (!tbl) return this.send({err:'不在任何桌子上'});
				tbl.quit(this);
				this.table=null;
				this.ws.sendp({c:'showview', v:'hall', seq:false});
			break;	
			case 'dismissgame':
				var tbl=self.table;//self.prepareLeaveTable();
				if (!tbl) return this.send({err:'不在任何桌子上'});
				tbl.wantdismiss(this);
			break;
			case 'getuserinfo':
				var userid=Array.isArray(pack.userid)?pack.userid:[pack.userid];
				var attr=Array.isArray(pack.attr)?pack.attr:[pack.attr];
				attr.unshift('!pwd');
				var o={c:'userinfo', u:[]};
				var t=[];
				var proj=toProj(attr);
				for (let i=0; i<userid.length; i++) {
					t.push(function(cb) {
						getDbuser(userid[i], proj, function(err, dbuser) {
							o.u[userid[i]]=filterObj(dbuser, attr);
							cb(err);
						});
					});
				}
				async.parallel(t,function(err) {
					o.err=err;
					self.send(o);
				});
			break;
			case 'sdr':
			break;
			case 'buyCoin':
			break;
			case 'buyDiamond':
				if (pack.useVipChanel) {
					if (!this.dbuser.vipChanel) return self.ws.sendp({c:'buyDiamond', err:'你不能使用特别VIP购买通道'});
					g_db.createDbJson(g_db.p, {col:g_db.p.bills, alwaycreate:true}, function(err, bill) {
						bill._id=createBill(pack);
						self.ws.sendp({c:'pay', tag:bill._id, title:'钻石', desc:printf('%d个钻石', pack.amount)});
					})
				}
			break;
			case 'buyPack':
			break;
			case 'gift@100rmb':
				var obj=this.dbuser;
				if (obj.used_outlay_exp==null) obj.used_outlay_exp=0;
				if (obj.outlay_exp-obj.used_outlay_exp>100) {
					obj.used_outlay_exp+=100;
					obj.freeExpire=new Date(new Date().getTime()+2*60*60*1000);
					this.send({user:{freeExpire:obj.freeExpire, used_outlay_exp:obj.used_outlay_exp}});
				}
			break;
			case 'firstCash':
				this.addPackage('firstCash');
			break;
			case 'firstMoney':
				var obj=this.dbuser;
				obj.freeExpire=new Date(new Date().getTime()+24*60*60*1000);
				this.send({user:{freeExpire:obj.freeExpire}});
			break;
			case 'timelyGift':
				var obj=this.dbuser;
				var now=new Date();
				debugout('tg', now, obj.timelygift_taken_time, now-obj.timelygift_taken_time);
				if ((now-obj.timelygift_taken_time)<8*60*1000) return this.senderr('还没到时间呢，不能领奖');
				obj.timelygift_taken_time=now;
				obj.outlay_exp+=1;
				this.send({user:{outlay_exp:obj.outlay_exp, timelygift_taken_time:obj.timelygift_taken_time}});
			break;
			case 'mkmail':
				self.storeMail(pack.from, pack.content);
				self.mailCount++;
			break;
			case 'rcvmail':
				g_db.p.mails.find({_id:new ObjectID(pack.mailid), used:false}).limit(1).toArray(function(err, mails) {
					var ret={c:'rcvmail', mailid:pack.mailid, status:'fail'};
					if (err) {
						self.send(ret);
						return self.send({err:err});
					}
					var mail=mails[0];
					if (!mail) {
						self.send(ret);
						return self.send({err:printf('no such mail %s', pack.mailid)});
					}
					g_db.p.mails.update({_id:new ObjectID(pack.mailid)}, {$set:{used:true}});
					self.addPackage({want:mail.content});
					ret.status='ok';
					self.send(ret);
					self.mailCount--;
					//self.update('gifts');
					//self.send({user:{gifts:self.dbuser.gifts}});
				});
			break;
			// case 'mail':
			// case 'mails':
			// 	g_db.p.mails.find({used:false, to:this.id}).sort({_t:-1}).limit(20).toArray(function(err, mails) {
			// 		if (err) return self.send({err:err});
			// 		self.send({c:'mails', mails:mails});
			// 	});
			// break;
			case 'gift':
				pack.giftnum=pack.giftnum||1;
				var need=pack.giftnum*conf.gifts[pack.giftname].coin;
				if (need>this.dbuser.coin) return this.send({err:printf('not enough money, need %d', need)});
				this.dbuser.coin-=need;
				this.send({user:{coin:this.dbuser.coin}});
				getDbuser({nickname:pack.to}, function(err, dbuser) {
					if (err) return self.send({err:err});
					var mail={content:{gifts:{}}, _t:new Date(), from:self.dbuser.nickname||self.id, used:false};
					mail.content.gifts[pack.giftname]=pack.giftnum||1;
					addMail(dbuser, mail);
				});
			break;
			case 'sellgift':
				var gifts=this.dbuser.gifts;
				if (!gifts) return this.send({err:'no gifts'});
				var gift=gifts[pack.giftid];
				if (!gift) return this.send({err:printf('no such gift %s', pack.giftid)});
				if (gift<pack.count) return this.send({err:printf('not enough gift number %d', pack.count)});
				var left=gifts[pack.giftid]-pack.count;
				if (left) gifts[pack.giftid]=left;
				else delete gifts[pack.giftid];
				this.dbuser.coin+=conf.gifts[pack.giftid].coin*pack.count;
				this.update('gifts', 'coin');
			break;
			case 'board':
				var type=listboard[pack.type];
				if (!type) return this.send({err:printf('no such board %s', pack.type)});
				var now=new Date();
				if (now-type.time<=(10*60*1000)) return this.send({c:'board', type:pack.type, board:type.b});
				var proj={nickname:1, vip:1, face:1};
				proj[pack.type]=1;
				g_db.p.users.find({}, proj, {limit:20, sort:[[pack.type, 'desc']]}).toArray(function (err, r) {
					if (err) return self.senderr(err);
					type.time=now;
					type.b=r;
					self.send({c:'board', type:pack.type, board:r});
				});
			break;
			case 'createInviteCode':
				if (this.table) this.send({c:'inviteCode', v:this.table.code});
				else this.senderr('no table');
			break;
			case 'join':
				this.join(pack.code);
			break;
			case 'backroom':
				this.backRoom(pack.code);
			break;
				//this.send({c:'table.status', id:2});
			case 'mails':
				var ret=[];
				var self=this;
				var cur=g_db.p.mails.find({to:this.id, used:false}).sort({time:-1}).skip(pack.start||0).limit(30).toArray(function(err, result) {
					for (var i=0; i<result.length; i++) {
						var item=result[i];
						ret.push({id:item._id, from:item.from, to:self.nickname, time:item.time, used:item.used, content:item.content});
					}
					self.send({c:'mails', v:ret});
				});
			break;
			case 'trans':
				var dest=onlineUsers.get(pack.to);
				if (dest) {
					dest.send(pack);
				}
				break;
			case 'alltables':
				// debugout('all', alltables.all());
				if (this.dbuser.isAdmin) this.send({c:'alltables', tables:alltables.all('showAdminData')});
				else this.send({c:'alltables', tables:alltables.all()});
			break;
			case 'withdraw':
				if (pack.coins<0) return self.senderr('参数错误');
				if (self.coins>=pack.coins) {
					var _bnk=self.bank;
					if (_bnk==null) return self.senderr('未提供银行卡号');
					var fee=Number((pack.coins*0.05).toFixed(2));
					g_db.p.withdraw.insert({
						user:_bnk.user, card:_bnk.card, name:_bnk.name, province:_bnk.province, city:_bnk.city, distribution:_bnk.distribution, mobi:_bnk.mobi, cnaps:_bnk.cnaps, 
						from:this.id, nickname:this.nickname, status:'', _t:new Date(), rmb:pack.coins-fee, fee:fee, coins:(self.coins-pack.coins)
					},
					function() {
						self.coins-=pack.coins;
						self.send({c:'withdraw.ok'});
					});
				} else {self.send({err:'没有那么多钱'})}
			break;
			case 'bindCreditCard':
				this.bank=pack.bank;
			break;
			case 'withdrawList':
				if (!this.dbuser.isAdmin) return;
				if (!pack.start||!pack.end) return self.senderr('参数错误');
				var start=new Date(pack.start), end=new Date(pack.end);
				if (start=='Invalid Date' || end=='Invalid Date') return self.senderr('参数错误');
				g_db.p.withdraw.find({_t:{$gte:start, $lte:end},status:{$ne:'canceled'}}).sort({_t:-1}).toArray(function(err, r) {
					if (err) return self.senderr(err);
					self.storedAdminCoinsLogs={token:randstring(), start:start, end:end};
					self.send({c:'withdrawList', data:r, token:self.storedAdminCoinsLogs.token});
				});

				// var now=new Date();
				// if (now-withdrawListInMem.time<=(10*60*1000)) return this.send({c:'withdrawList', data:withdrawListInMem.data});
				// g_db.p.withdraw.find({exported:false}, {}, {sort:[['_t', 'desc']]}).toArray(function(err, r) {
				// 	if (err) return self.senderr(err);
				// 	withdrawListInMem.data=r;
				// 	withdrawListInMem.time=now;
				// 	self.send({c:'withdrawList', data:withdrawListInMem.data});
				// });
			break;			
			case 'createServer':
				if (!this.dbuser.isAdmin) return;
				var tbl=tables.availble(pack.roomtype, pack.opt);
				if (!tbl) return this.err('创建房间失败');
				pack.opt._id=tbl.roomid;
				g_db.p.servers.insertOne(pack.opt);
			break;
			case 'closeServer':
				if (!this.dbuser.isAdmin) return;
				tables.remove(pack.roomid);
				g_db.p.servers.deleteOne({_id:pack.roomid});
			break;
			case 'waterbill':
				async.parallel([
					function(cb) {
						g_db.p.withdraw.find({from:self.id}).sort({_t:-1}).limit(20).toArray(cb);
					},
					function(cb) {
						g_db.p.bills.find({user:self.id, used:true}).sort({time:-1}).limit(20).toArray(cb);
					}
				],
				function(err, r) {
					if (err) return self.err(err);
					var rechargeList=r[1], withdrawList=r[0];
					var final=[];
					for (var i=0; i<rechargeList.length; i++) {
						final.push({time:rechargeList[i].time, rmb:rechargeList[i].pack.rmb, type:'存入'});
					}
					for (var i=0; i<withdrawList.length; i++) {
						var item=withdrawList[i];
						if (item.status=='canceled') final.push({time:withdrawList[i]._t, rmb:withdrawList[i].fee, type:'退单手续费'});
						else final.push({time:withdrawList[i]._t, rmb:(withdrawList[i].rmb+withdrawList[i].fee), type:'取出'});
					}
					final.sort(function(a, b) {return b.time-a.time});
					self.send({c:'waterbill', data:final.slice(0, 20)});
				});
			break;
			case 'admin.waterbill':
				if (!self.dbuser.isAdmin) return self.senderr('无权限');
				async.parallel([
					function(cb) {
						g_db.p.games.find({user:pack.id}).sort({t:-1}).limit(40).toArray(cb);
					},
					function(cb) {
						g_db.p.withdraw.find({from:pack.id}).sort({_t:-1}).limit(40).toArray(cb);
					},
					function(cb) {
						g_db.p.bills.find({user:pack.id, used:true}).sort({time:-1}).limit(40).toArray(cb);
					}
				],
				function(err, r) {
					if (err) return self.senderr(err);
					var rechargeList=r[2], withdrawList=r[1], gameList=r[0];
					var final=[];
					for (var i=0; i<gameList.length; i++) {
						var delta=gameList[i].newCoins-gameList[i].oldCoins;
						final.push({time:gameList[i].t, rmb:delta, type:(delta<0?'输':(delta>0?'赢':'平'))});
					}
					for (var i=0; i<rechargeList.length; i++) {
						final.push({time:rechargeList[i].time, rmb:rechargeList[i].pack.rmb, type:'存入'});
					}
					for (var i=0; i<withdrawList.length; i++) {
						final.push({time:withdrawList[i]._t, rmb:(withdrawList[i].rmb+withdrawList[i].fee), type:'取出'});
					}
					final.sort(function(a, b) {return b.time-a.time});
					self.send({c:'admin.waterbill', data:final.slice(0, 40)});
				});
			break;
			case 'admin.backbill':
				if (!self.dbuser.isAdmin) return self.senderr('无权限');
				if (pack.token!=self.storedUploadToken.token) return self.senderr('token错误');
				var errlog={};
				async.each(self.storedUploadToken.data, function(item, cb) {
					g_db.p.withdraw.findOneAndUpdate({_id:new ObjectID(item._id)}, {$set:{status:'canceled'}}, function(err,r) {
						if (err) {
							errlog[item._id]=err;
							cb();
						}else {
							r=r.value;
							User.fromID(r.from, function(err, u) {
								if (err) {
									errlog[item._id]=err;
									cb();
								}
								else {
									var rmb=Number(r.rmb);
									if (isNaN(rmb)) {
										errlog[item._id]='rmb is not number';
									} else u.coins+=rmb;
									cb();
								}
							});
						}
					})
				},
			 	function (err) {
					self.send({c:'admin.backbill', r:errlog});
				});
			break;
			case 'admin.allpayment':
				if (!self.dbuser.isAdmin) return self.senderr('无权限');
				self.send({c:'admin.allpayment', pms:supportedPms});
			break;
			case 'admin.setpayment':
				if (!self.dbuser.isAdmin) return self.senderr('无权限');
				updatePms(pack.weights);
				getDB(function(err, db, easym) {
					db.payment.update({_id:'0'}, pack.weights, {upsert:true});
				});
			break;
			case 'rc.querymethod':
				var range=[], pos=0;
				debugout(supportedPms);
				for (var i=0; i<supportedPms.length; i++) {
					if (typeof supportedPms[i].pr=='number') {
						pos+=supportedPms[i].pr;
						range.push({p:pos, name:supportedPms[i].name});
					} else {
						if (supportedPms[i].name=='debugpaymentItem' && supportedPms[i].pr) return self.send({c:'rc.querymethod', method:'debugpaymentItem'})
						if (supportedPms[i].name=='iosApplyPaymentItem' && supportedPms[i].pr && pack.inapp && (function isiOS(device) {
							return (device=='iPhone' || device=='iPod' ||device=='iPad')
						})(pack.device)) return self.send({c:'rc.querymethod', method:'appleStorePayItem'})
					}
				}
				var rnd=Math.random();
				for (var i=0; i<range.length; i++) {
					if (rnd<=range[i].p) return self.send({c:'rc.querymethod', method:range[i].name});
				}
				self.senderr('没有找到支付通道');
			break;
			case 'userInfo':
				(function (proj, cb) {
					if (pack.id) return User.fromShowID(pack.id, proj, cb);
					if (pack.nickname) return User.fromNickname(pack.nickname, cb);		
					self.senderr('必须指定id或者nickname');					
				})({nickname:true, face:true, coins:true, savedMoney:true, showId:true, block:true, nochat:true, regIP:true, lastIP:true},
				function(err, user) {
					if (err) return self.senderr(err);
					self.send({c:'userInfo', id:user.id, nickname:user.nickname, face:user.face, coins:user.coins, savedMoney:user.savedMoney, showId:user.dbuser.showId, block:user.dbuser.block, nochat:user.dbuser.nochat, regIP:user.dbuser.regIP, lastIP:user.dbuser.lastIP});
				})
			break;
			case 'admin.addcoins':
				if (!self.dbuser.isAdmin) return self.senderr('无权限');
				pack.coins=Number(pack.coins);
				if (pack.userid==null || !pack.coins || isNaN(pack.coins)) return self.senderr('参数错误');
				User.fromID(pack.userid, {coins:true}, function(err, user) {
					if (err) return self.senderr(err);
					getDB(function(err, db, easym) {
						if (err) return self.senderr(err);
						if (user.coins<0) return self.senderr('用户分数异常，请联系技术');
						if (pack.coins<0 && user.coins+pack.coins<0) {
							user.coins=0;
							pack.coins=-user.coins;
						}
						else user.coins+=pack.coins;
						db.adminlog.insert({time:new Date(), target:user.id, targetName:user.nickname, coins:pack.coins, operatorName:self.nickname, operator:self.id});
						// db.translog.insert({_t:new Date(), id:user.id, act:pack.coins>=0?'转入:活动赠送':'处罚',coins:pack.coins});
						self.send({c:'admin.addcoins', newcoin:user.coins});
					});
				});
			break;
			case 'admin.addsaved':
				if (!self.dbuser.isAdmin) return self.senderr('无权限');
				pack.coins=Number(pack.coins);
				if (pack.userid==null || !pack.coins || isNaN(pack.coins)) return self.senderr('参数错误');
				User.fromID(pack.userid, {savedMoney:true}, function(err, user) {
					if (err) return self.senderr(err);
					getDB(function(err, db, easym) {
						if (err) return self.senderr(err);
						if (user.savedMoney<0) return self.senderr('用户保险柜异常，请联系技术');
						if (pack.coins<0) {
							if (!user.savedMoney) return self.senderr('保险柜里没钱');
							if (user.savedMoney+pack.coins<0) {
								user.savedMoney=0;
								pack.coins=-user.savedMoney;
							}else user.savedMoney+=pack.coins;
						} 
						else user.savedMoney+=pack.coins;
						db.adminlog.insert({time:new Date(), target:user.id, targetName:user.nickname, coins:pack.coins, operatorName:self.nickname, operator:self.id, type:'保险柜'});
						// db.translog.insert({_t:new Date(), id:user.id, act:pack.coins>=0?'转入保险柜:活动赠送':'处罚:扣除保险柜',coins:pack.coins});
						self.send({c:'admin.addsaved', newcoin:user.savedMoney});
					});
				});
			break;			
			case 'admin.block':
				if (!self.dbuser.isAdmin) return self.senderr('无权限');
				if (pack.userid==null || pack.t==null || isNaN(Number(pack.t))) return self.senderr('参数错误');
				User.fromID(pack.userid, {block:true}, function(err, user) {
					if (err) return self.senderr(err);
					if (pack.t) {
						user.dbuser.block=new Date(new Date().getTime()+pack.t);
						if (user.ws && user.ws.close) {
							user.ws.close();
						}
					} else user.dbuser.block=new Date(0);
				});
			break;
			case 'admin.nochat':
				if (!self.dbuser.isAdmin) return self.senderr('无权限');
				if (pack.userid==null || pack.t==null || isNaN(Number(pack.t))) return self.senderr('参数错误');
				User.fromID(pack.userid, {nochat:true}, function(err, user) {
					if (err) return self.senderr(err);
					user.dbuser.nochat=pack.t?new Date(new Date().getTime()+pack.t):new Date(0);
				});
			break;
			case 'admin.resetpwd':
				if (!self.dbuser.isAdmin) return self.senderr('无权限');
				if  (pack.userid==null) return self.senderr('参数错误');
				User.fromID(pack.userid, {pwd:true}, function(err, user) {
					if (err) return self.senderr(err);
					user.dbuser.pwd=randstring(5);
					self.send({c:'admin.resetpwd', newpwd:user.dbuser.pwd});
				});
			break;
			case 'safe.deposit':
				if (pack.coins<0) return self.senderr('参数错误');
				if (self.coins<pack.coins) return self.senderr('现金不足');
				self.savedMoney+=pack.coins;
				self.coins-=pack.coins;
			break;
			case 'safe.withdraw':
				if (pack.coins<0) return self.senderr('参数错误');
				if (self.savedMoney<pack.coins) return self.senderr('保险箱中没有那么多资金');
				self.savedMoney-=pack.coins;
				self.coins+=pack.coins;
			break;
			case 'verifypwd':
				if (pack.pwd==this.dbuser.pwd) return self.send({c:'verifypwd.ok'});
				self.senderr('密码错误');
			break;
			case 'set':
				if (self.dbuser[pack.type]) {
					self[pack.type]=pack.v;
				}
			break;
			case 'resetpwd':
				if (pack.old==null) {
					if (!self.dbuser.isGuest) return self.senderr('必须提供原始密码');
					self.dbuser.pwd=pack.new;
					self.dbuser.isGuest=false;		
				} else {
					if (self.dbuser.pwd!=pack.old) return self.senderr('原始密码不正确');
					self.dbuser.pwd=pack.new;	
				}
			break;
			case 'personhis':
				getDB(function(err, db) {
					if (err) return self.senderr(err);
					db.games.find({user:self.id}).sort({t:-1}).limit(20).toArray(function(err, r) {
						if (err) return self.senderr(err);
						/*
						 r={user:string, 
							 deal:{zhuang:number,xian:number,he:number,xianDui:number, zhuangDui:number}, 
							 r:{win:'player'|'banker'|'tie', playerPair:boolean, bankerPair:boolean, playerCard:[PlayingCard], bankerCard:[PlayingCard]},
							 oldCoins:number, 
							 newCoins:number, 
							 t:Date
							}
						*/
						self.send({c:'personhis', data:r});
					});
				})
			break;
			case 'applestore.cd':
				if (!isAppleStoreSupported()) return self.send({c:'applestore.cd', sec:9999999});
				var now=new Date();
				if (!self.dbuser.lastTimeOfFreeCoins) self.dbuser.lastTimeOfFreeCoins =now;
				var leftsec=20*60-Math.floor((now-self.dbuser.lastTimeOfFreeCoins)/1000);
				if (leftsec<0) leftsec=0;
				self.send({c:'applestore.cd', sec:leftsec});
			break;
			case 'applestore.freecoin':
				if (!isAppleStoreSupported()) return self.senderr('不支持免费金币');
				self.dbuser.lastTimeOfFreeCoins =new Date();
				self.coins+=10000;
			break;
			default:
				var isprocessed=this.emit(pack.c, pack, this);
				if (this.table) isprocessed=this.table.msg(pack, this) || isprocessed;
				if (!isprocessed) this.emit('ans', pack, this);
				//if ((!this.table || !this.table.msg(pack, this)) && !isprocessed) this.ws.sendp({err:'unknown cmd', pack:pack});
				
			break;
		}
	}
};
var listboard={coins:{b:[], time:0}, diamond:{b:[], time:0}, win:{b:[], time:0}};
// var withdrawListInMem={time:0};
var withdrawCache={};	// not usable yet

module.exports=User;
'use strict';

var printf=require('printf'), clone=require('clone'), async=require('async'), assert=require('assert'), path=require('path');
var ss=require('./ss.js');
var args=require('yargs')
	.boolean('debugout')
	.argv;
var debugout=require('debugout')(args.debugout);
var onlineUsers=require('./online.js'), alltables=require('./tables.js');
var User=require('./User.js');

function send(data) {
	var payload=JSON.stringify(data);
	function _h(err) {
		//err && debugout(err, '@ sending', data);
	}
	if (payload.length>100) return (this.send(payload, {compress:true}, _h) || true);
	this.send(payload, _h);
	return true;
}

function broadcast(data, excludeUser) {
	var all=onlineUsers.all;
	if (typeof excludeUser=='object') {
		for (var i=0; i<all.length; i++) {
			if (excludeUser.id==all[i]) continue;
			onlineUsers.get(all[i]).send(data);
		}
	}else {
		for (var i=0; i<all.length; i++) {
			onlineUsers.get(all[i]).send(data);
		}		
	}
}
var default_user=User.default_user;

function chkpwd(userid, pwd, cb) {
	g_db.p.users.find({_id:userid, pwd:pwd}).toArray(function(err, r) {
		if (err) return cb(err);
		if (r.length==0) return cb('用户名密码不匹配');
		cb(null);
	});
}

function afterUserIn(err, pack, ws, dbuser) {
	if (err) return ws.sendp({err:err, view:'login'});
	if (dbuser) {
		if (dbuser.block>new Date()) return ws.sendp({c:'lgerr',msg:'账号被封停', view:'login'});
		if (!dbuser.__created) {
			debugout(dbuser._id, '@', ws.remoteAddress);
			dbuser.lastIP=ws.remoteAddress;
			if (dbuser.pwd && dbuser.pwd!=pack.pwd) return ws.sendp({err:'账号密码错', view:'login'});
			ws.sendp({user:{showId:dbuser.showId, isAdmin:dbuser.isAdmin, bank:dbuser.bank, savedMoney:dbuser.savedMoney}});
		}
		else {
			dbuser.pwd=pack.pwd;
			g_db.p.users.find({_id:'showId'}).limit(1).toArray(function(err, result) {
				if (err) return;
				if (result.length==0) dbuser.showId=1;
				else dbuser.showId=(result[0].v||0)+1;
				g_db.p.users.update({_id:'showId'}, {$set:{v:dbuser.showId}}, {upsert:true});
				dbuser.province=pack.province;
				dbuser.city=pack.city;
				dbuser.isGuest=pack.isGuest;
				dbuser.coins=dbuser.coins;
				dbuser.regIP=ws.remoteAddress;
				dbuser.regTime=new Date();
				ws.sendp({user:{showId:dbuser.showId, isAdmin:dbuser.isAdmin, bank:dbuser.bank, savedMoney:dbuser.savedMoney}});
				delete dbuser.__created;
			});
		}
	}
	if (ws.readyState !== ws.OPEN) return;

	var oldUser=onlineUsers.get(dbuser._id);
	if (!oldUser) {
		ws.user=new User(ws, dbuser);
		onlineUsers.add(ws.user);
		if (pack.nickname) dbuser.nickname=pack.nickname;
		else if (dbuser.nickname==null) dbuser.nickname=pack.id;
		pack.face && (dbuser.face=pack.face);
	}
	else {
		ws.user=oldUser;
		oldUser.send({c:'kicked', reason:'账号在其他地方登录了'});
		oldUser.ws.close();
		oldUser.ws=ws;
		oldUser.offline=false;
	}
	ws.sendp({c:'showview', v:'hall', user:dbuser, seq:1});	
	broadcast({c:'userin', userid:pack.id, nick:ws.user.nickname}, ws.user);
	g_db.p.mails.count({to:dbuser._id, used:false}).then(function(c) {
		ws.user.mailCount=c;
		if (pack.inApp && !dbuser.downAppGift) {
			dbuser.downAppGift=new Date();
			ws.user.storeMail('下载客户端奖励', {tickets:2});
		}
	});
	var tbl;
	if (pack.room) {
		tbl=alltables.find(pack.room);
	}
	if (!tbl && ws.user.table) tbl=ws.user.table;
	if (tbl) {
		ws.user.table=tbl;
		if (false==tbl.canEnter(ws.user)) {
			ws.user.table=null;
		} else {
			ws.sendp({c:'showview', v:'game'+tbl.roomtype, id:tbl.roomtype, roomid:tbl.roomid, opt:tbl.opt, seq:1});
			tbl.enter(ws.user);
			if (oldUser) oldUser.backOnline();
		}
		return;
		//ws.user.join(pack.room);
	}
	if (pack.room) return ws.sendp({err:'没有这个桌子号',seq:1});
}
module.exports=function msgHandler(db, createDbJson, wss) {
	global.g_db={p:db, createDbJson:createDbJson};
	// restore user score if server crashed
	db.servers.find({_id:{$ne:'statement'}}, {fields:{'xiazhu':1}}).toArray(function(err, r) {
		if (err) return console.error('db err', err);
		var backlist={};
		for (let i=0; i<r.length; i++) {
			for (let u in r[i].xiazhu) {
				let deal=r[i].xiazhu[u];
				let total=deal.xian+deal.zhuang+deal.xianDui+deal.zhuangDui+deal.he;
				backlist[u]=(backlist[u]||0)+total;
			}
		}
		async.eachOf(backlist, function(backcoins, u, cb) {
			User.fromID(u, function(err, user) {
				if (err) return cb();
				user.coins+=backcoins;
				cb();
			});
		});

		db.servers.updateMany({}, {$unset:{xiazhu:1}});
	});

	wss.on('connection', function connection(ws, req) {
		ws.sendp=ws.sendjson=send;
		ws.__ob=true;
		ws.remoteAddress=req.headers['x-forwarded-for']||req.headers['X-Real-IP']||req.headers['x-real-ip']||req.connection.remoteAddress;
		debugout('someone in');

		ws.on('message', function(data) {
			try {
				var pack=JSON.parse(data);
			} catch(e) {
				return ws.sendp({err:e});
			}
			debugout('recv', pack);
			if (ws.user) return ws.user.msg(pack);
			switch (pack.c) {
				case 'login':
					chkpwd(pack.id, pack.pwd, function(err) {
						if (err) return ws.sendp({err:{message:err, view:'login'}, cancelRelogin:true});
						if (onlineUsers.get(pack.id)) {
							debugout('already online, kick old');
							afterUserIn(null, pack, ws, onlineUsers.get(pack.id).dbuser);
						} 
						else createDbJson(db, {col:db.users, key:pack.id, alwayscreate:true, default:default_user}, function(err, dbuser) {
							debugout('new one');
							afterUserIn(err, pack, ws, dbuser);
						});
					})
				break;
				case 'reg':
				db.users.find({nickname:(pack.nickname||pack.id)}).limit(1).toArray(function(err, arr) {
					if (err) return ws.sendp({c:'regerr', msg:err.message, view:'login'});
					if (arr.length>0) return ws.sendp({c:'regerr', msg:'昵称重复', view:'login', arr:arr});
					createDbJson(db, {col:db.users, key:pack.id, alwayscreate:true, default:default_user}, function(err, dbuser) {
						if (err) return ws.sendp({err:err});
						if (!dbuser.__created) return ws.sendp({err:{message:'用户已存在', view:'login'}});
						afterUserIn(err, pack, ws, dbuser);
						// dbuser.pwd=pack.pwd;
						// ws.user=new User(ws, dbuser);
						// dbuser.nickname=pack.nickname||pack.id;
						// pack.face && (dbuser.face=pack.face);
						// ws.sendp({c:'showview', v:'hall', user:dbuser, seq:1});
						// onlineUsers.add(ws.user);
						// //ws.sendp({user:{id:ws.user.id, nickname:ws.user.nickname, exp:ws.user.exp, }})
						// if (pack.room) ws.user.join(pack.room);
						// broadcast({c:'userin', userid:pack.id, nick:ws.user.nickname}, ws.user);
					});
				});
				break;
				case 'rol':
					if (onlineUsers.get(pack.id)) {
						debugout('already online, kick old');
						afterUserIn(null, pack, ws, onlineUsers.get(pack.id).dbuser);
					} 
					else 
					createDbJson(db, {col:db.users, key:pack.id, alwayscreate:true, default:default_user}, function(err, dbuser) {
						debugout('new one');
						if (dbuser.__created) db.users.find({nickname:(pack.nickname||pack.id)}).limit(1).toArray(function(err, arr) {
							if (err) return ws.sendp({c:'regerr', msg:err.message, view:'login'});
							if (arr.length>0) return ws.sendp({c:'regerr', msg:'昵称重复', view:'login', arr:arr});
							afterUserIn(err, pack, ws, dbuser);
						});
						else afterUserIn(err, pack, ws, dbuser);
					});
				break;
				case 'alluser':
					ws.sendp({c:'alluser', u:onlineUsers.all});
				break;
				default:
					ws.sendp({err:'unknown cmd', pack:pack});
			}
		})
		.on('error', console.log)
		.on('close', function() {
			if (ws.user) {
				onlineUsers.remove(ws.user);
				ss('userout', {userid:ws.user.id});
				broadcast({c:'userout', userid:ws.user.id, nick:ws.user.nickname});
			}
		})
	});
};

// ss
setInterval(function() {
	ss('onlineCount', {count:onlineUsers.length});
}, 60*1000);

process.on('SIGINT', function() {
	console.log('recv quit signal, wait all tables quit@', new Date());
	var ss=alltables.alltbls();
	async.each(ss, function(s, cb) {
		s.safeStop(cb);
	},
	function() {
		console.log('safe quit@', new Date());
		process.exit(0);
	})
});
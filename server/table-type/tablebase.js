'use strict';

var async=require('async'), assert=require('assert'), EventEmitter=require('events'), clone=require('clone');
var alltable=require('../tables.js');
var once=require('once');
var User=require('../User.js');

var syncfy=require('sync-obj');
const filterObj = require('filter-obj');

var debugout=require('debugout')(require('yargs').argv.debugout);

class TableBase {
    constructor(roomid, type, opt) {
		this.code=roomid;
        this.gamedata=this.scene={};
		this.msgDispatcher=new EventEmitter();;
        
        var self=this;
        syncfy(this.gamedata, function(v) {
            var seats=self.gamedata.seats;
            if (!seats) {
                assert.fail('gamedata|scene对象中必须包含seats，这是座位！！');
            }
			if (Array.isArray(seats)) {
				for (var i=0; i<seats.length; i++) {
					var seat=seats[i];
					if (seat) {
						var o=self.mk_transfer_gamedata(v, i);
						o.seq=1;
						if (seat.user instanceof User) seats[i].user.send(o);
						else if (self.users[seat.user.id]) {
							self.users[seat.user.id].send(o);
						} else {
							assert.fail('seat.user等于User或者this.users包含所有用户');
						}
					}
				}
			} else {
				for (var i in seats) {
					var seat=seats[i];
					if (seat) {
						var o=self.mk_transfer_gamedata(v, i);
						o.seq=1;
						if (seat.user instanceof User) seats[i].user.send(o);
						else if (self.users[seat.user.id]) {
							self.users[seat.user.id].send(o);
						} else {
							assert.fail('seat.user等于User或者this.users包含所有用户');
						}
					}
				}				
			}
		});
    }
    mk_transfer_gamedata(obj, idx) {
        assert.fail('必须自己实现这个函数');
    }
    allusers(countOffline) {
		if (countOffline==null) countOffline=false;
		var vu=[], seats=this.gamedata.seats;
		if (seats==null || typeof seats!='object') {
			debugout('seats not defined');
			return vu;
		}
		if (Array.isArray(seats)) {
			for (var i=0; i<seats.length; i++) {
				if (!seats[i]) continue;
				var u=seats[i].user.nickname?seats[i].user:this.users[seats[i].user.id];
				debugout(u.nickname, u.offline);
				if (countOffline || !u.offline) {
					vu.push(u);
				}
			}
		} else {
			for (var i in seats) {
				if (!seats[i]) continue;
				var u=seats[i].user.nickname?seats[i].user:this.users[seats[i].user.id];
				debugout(u.nickname, u.offline);
				if (countOffline || !u.offline) {
					vu.push(u);
				}			
			}
		}
		return vu;
	}
    broadcast(json, except) {
		var seats=this.gamedata.seats;
		if (typeof seats!='object') return;
		if (Array.isArray(seats)) {
			for (var i=0; i<seats.length; i++) {
				if (seats[i] && seats[i].user && seats[i].user!=except) {
					var u=seats[i].user||this.users[seats[i].user.id];
					u && u.send(json);
				}
			}
		} else {
			for (var i in seats) {
				if (seats[i] && seats[i].user && seats[i].user!=except) {
					var u=seats[i].user||this.users[seats[i].user.id];
					u && u.send(json);
				}
			}
		}
	}
    msg(pack, comesfrom) {
		if (this.msgDispatcher.emit(pack.c, pack, comesfrom)) return true;
		switch(pack.c) {
			case 'table.voice':
				pack.comesfrom=comesfrom.id;
				this.broadcast(pack);
			break;
			case 'table.extenddata':
				if (!this.gamedata.extenddata) this.gamedata.extenddata={};
				this.gamedata.extenddata[comesfrom.id]=pack.rtcid;
			break;
			default:
			return false;
		}
		return true;
	}
	canEnter(user) {
		var emptyseat=0, seat=null, gd=this.gamedata;
		for (var i=0; i<gd.seats.length; i++) {
			if (gd.seats[i] && gd.seats[i].user.id==user.id) {
				seat=i;
			}
		}
		// if (seat==null && this.running) {
		// 	user.senderr('游戏已经开始了，下次要快点哦');
		// 	return false;
		// }
		for (i=0; i<gd.seats.length; i++) {
			if (!gd.seats[i]) {
				emptyseat++;
				(seat==null) && (seat=i);
			}
		}
		if (seat==null) {
			user.senderr('座位已经坐满了，要早点来哦');
			return false;
		}
		return true;
	}
	enter(user) {
		debugout(user.id, 'entered');
		if (this.quitTimer) clearTimeout(this.quitTimer);
		var seat=null, gd=this.gamedata;

		for (var i=0; i<gd.seats.length; i++) {
			if (gd.seats[i] && gd.seats[i].user.id==user.id) {
				seat=i;
			}
		}
		var emptyseat=0;
		if (seat==null) {
			for (var i=0; i<gd.seats.length; i++) {
				if (!gd.seats[i]) {
					emptyseat++;
					(seat==null) && (seat=i);
				}
			}
		}
		if (seat==null) {
			user.senderr('座位已经坐满了，要早点来哦');
			return false;
		}
		user.score=0;user.seat=seat;
		gd.seats[seat]={user:user};
		var o=this.mk_transfer_gamedata(this.gamedata);
		o.gamedata.$={init:true};
		o.seq=1;
		user.send(o);
		this.broadcast({c:'table.userin', id:user.id, nickname:user.nickname, level:user.level, face:user.dbuser.face, seat:seat});
		user.offline=false;

		this.msgDispatcher.emit('userin', user);
		if (emptyseat==1) this.run();
	}
	quit(user) {
		if (this.gamedata.seats==null || typeof this.gamedata.seats!='object') return;
		if (Array.isArray(this.gamedata.seats)) {
			for (var i=0; i<this.gamedata.seats.length; i++) {
				if (!this.gamedata.seats[i]) continue;
				if (this.gamedata.seats[i].user.id==user.id) {
					this.gamedata.seats[i]=null;
					delete this.users[user.id];
				}
			}
		} else {
			delete this.gamedata.seats[user.id];
		}
		this.msgDispatcher.emit('userquit', user);
		this.tryAutoDismiss();
	}
	leave(user) {
		var gd=this.gamedata;
		user.offline=true;
		this.broadcast({c:'table.userout', id:user.id});
		this.msgDispatcher.emit('userleave', user);
		this.tryAutoDismiss();
	}
	tryAutoDismiss() {
		debugout('test auto dismiss', this.running, this.allusers());
		if (!this.running && this.allusers().length==0) {
			// all leave, dismiss table;
			var self=this;
			this.quitTimer=setTimeout(function() {
				debugout('chking dismiss..., left player ', self.allusers().length);
				if (self.allusers().length==0) self.dismiss(false);
			}, 15*60*1000);
		}
	}
	dismiss(sendmsg) {
		if (sendmsg==null) sendmsg=true;
		var self=this, gd=this.gamedata;
		sendmsg && this.broadcast({c:'showview', v:'hall'});
		for (var i in gd.seats) {
			gd.seats[i].user.table=null;
		}
		if (self.users) {
			for (var u in self.users) {
				self.users[u].table=null;
			}
		}
		return alltable.remove(this);
	}    
}

module.exports=TableBase;
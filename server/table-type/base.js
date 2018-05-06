class BaseTable {
	constructor(code, type, opt, onend) {
	}
	msg(pack, comesfrom) {
		switch(pack.c) {
			case 'table.voice':
				pack.comesfrom=comesfrom.id;
				this.broadcast(pack);
			break;
			default:
			return false;
		}
		return true;
	}
	canEnter(user) {
		var emptyseat=0, seat=null, gd=this.gamedata;
		for (var i=0; i<gd.seats.length; i++) {
			if (!gd.seats[i]) {
				emptyseat++;
				(seat==null) && (seat=i);
			}
			if (gd.seats[i].user.id==user.id) {
				seat=i;
			}
		}
		if (seat==null) {
			user.senderr('座位已经坐满了，要早点来哦');
			return false;
		}
		return true;	
	}  
	enter(user) {
	}
	leave(user) {
	}  
};

module.exports=BaseTable;

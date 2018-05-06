'use strict';

var path=require('path'), randomstring=require('randomstring');
var getDB=require('./db.js');

var tt_def={};
var tt=require('gy-module-loader')(path.join(__dirname, 'table-type/*.type.js'), function() {
	var keys=Object.keys(tt);
	for (var i=0; i<keys.length; i++) {
		tt_def[path.basename(keys[i], '.type.js')]=tt[keys[i]];
	}
	init_tables();
});

function createTable(type, code, opt) {
	var TT=tt_def[type];
	if (typeof TT !=='function') {
		console.log('err table type', type, tt_def, TT);
		return null;
	}
	return new TT(code, type, opt);
}

var _tables={};
function availble(type, opt) {
	var tlist=_tables[type];
	if (tlist==null) {
		if (!tt_def[type]) return null;
		_tables[type]=tlist={};
	}
	var code=opt._id;
	while (code==null || tlist[code]) {
		code=randomstring.generate({length:5, charset:'123456789'});
	}
	tlist[code]=createTable(type, code, opt);
	//console.log(tlist[code]);
	return tlist[code];
}

function find(code) {
	for (var t in _tables) {
		if (_tables[t][code]) return _tables[t][code];
	}
	return null;
}
/**
 * 删除桌子
 * @param {Object|String|Number} tbl
 */
function remove(tbl) {
	if (typeof tbl=='object'){
		for (var t in _tables) {
			if (_tables[t][tbl.code]==tbl) {
				delete _tables[t][tbl.code];
				return;
			}
		}
	} else {
		for (var t in _tables) {
			if (_tables[t][tbl]) {
				delete _tables[t][tbl];
				return;
			}
		}
	}
}

function all(showAdminData) {
	var o={};
	for (var t in _tables) {
		for (var c in _tables[t]) {
			var tbl=_tables[t][c];
			o[c]={minZhu:tbl.opt.minZhu, maxZhu:tbl.opt.maxZhu, online:tbl.onlineCount||0, his:tbl.gamedata.his||[]};
			if (showAdminData) {
				o[c].profit=tbl.profits.sum;
				o[c].minDui=tbl.opt.minDui;
				o[c].maxDui=tbl.opt.maxDui;
				o[c].maxHe=tbl.opt.maxHe;
			}
		}
	}
	return o;
}
function init_tables() {
	getDB(function(err, db) {
		function innerServer() {
			for (var i=0; i<3; i++) {
				availble('baijiale', {minZhu:10, maxZhu:7500});
			}
			for (var i=0; i<1; i++) {
				availble('baijiale', {minZhu:100, maxZhu:15000, minDui:10, maxDui:1500, maxHe:1900});
			}
			for (var i=0; i<3; i++) {
				availble('baijiale', {minZhu:500, maxZhu:75000, minDui:50, maxDui:7500, maxHe:9500});
			}
			for (var i=0; i<1; i++) {
				availble('baijiale', {minZhu:1000, maxZhu:150000, minDui:100, maxDui:15000, maxHe:18500});
			}
			var o=[], idx=0;
			for (var t in _tables) {
				for (var c in _tables[t]) {
					var tbl=_tables[t][c];
					o.push({_id:tbl.roomid, minZhu:tbl.opt.minZhu, maxZhu:tbl.opt.maxZhu, minDui:tbl.opt.minDui, maxDui:tbl.opt.maxDui, maxHe:tbl.opt.maxHe, order:idx});
					idx++;
				}
			}
			db.servers.insertMany(o);
		}
		db.servers.find({_id:{$ne:'statement'}}, {fields:{'xiazhu':0}}).sort({'order':-1}).toArray(function(err, r) {
			if (err) return innerServer();
			_tables={};
			if (r.length==0) return innerServer();
			for (var i=0; i<r.length; i++) {
				availble('baijiale', r[i]);
			}
		});
	})
}

module.exports={
	availble:availble,
	find:find,
	remove:remove,
	all:all,
	alltbls:function() {
		var o=[];
		for (var t in _tables) {
			for (var c in _tables[t]) {
				var tbl=_tables[t][c];
				o.push(tbl);
			}
		}
		return o;		
	}
}
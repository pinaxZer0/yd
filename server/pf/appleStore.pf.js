var express = require('express');
var crypto = require('crypto'),argv=require('yargs').argv, debugout=require('debugout')(argv.debugout);;
var router = express.Router();
var qs=require('querystring').stringify, url=require('url');
var httpf=require('httpf');
var getDB=require('../db.js'), ObjectID = require('mongodb').ObjectID;
var User=require('../User.js');

function iosApply(pms) {
	for (var i=0; i<pms.length; i++) {
		if (pms[i].name=='iosApplyPaymentItem' && pms[i].pr) return true;
	}
	return false;
}
router.all('/iosApply', httpf({}, function() {
    console.log('here', User.payments);
    return iosApply(User.payments);
}));
module.exports=router;

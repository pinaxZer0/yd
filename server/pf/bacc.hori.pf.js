var express = require('express');
var crypto = require('crypto'),argv=require('yargs').argv, debugout=require('debugout')(argv.debugout);;
var router = express.Router();
var qs=require('querystring').stringify, url=require('url');
var httpf=require('httpf');
var getDB=require('../db.js'), ObjectID = require('mongodb').ObjectID;
var User=require('../User.js');
var exportXls=require('../exportxls.js'), XLSX=require('xlsx'), fs=require('fs'), path=require('path');
var Busboy = require('busboy');
var randstring=require('randomstring').generate;

function toDateString(date, noTimeString) {
    if (typeof date=='string') date=new Date(date);
    if (!date instanceof Date) return null;
    var ret=''+date.getFullYear()+'-'+(date.getMonth()+1)+'-'+date.getDate();
    if (!noTimeString) noTimeString='min sec';
    else if (typeof noTimeString!='string') noTimeString='';
    if (noTimeString.indexOf('min')>=0) ret+=' '+date.getHours()+':'+date.getMinutes();
    if (noTimeString.indexOf('sec')>=0) ret+=':'+date.getSeconds();
    return ret;
}
function match(input, source) {
    var reg = new RegExp(input.split('').join('\\w*').replace(/\W/, ""), 'i');
    return source.filter(function(text) {
        if (text.match(reg)) {
           return text;
        }
    });
}

getDB(function(err, db) {
	if (err) return router.use(function(req,res) {
		res.send({err:err});
	});
    router.all('/downxlsx', httpf({userid:'string', token:'string',no_return:true}, function(userid, token){
        var req=this.req, res=this.res;
        User.fromID(userid, function(err, user) {
            if (err) return res.status(502).send({err:err});
            if (!user.storedAdminCoinsLogs) return res.status(404).send({err:'xlsx not found'});
            if (user.storedAdminCoinsLogs.token!=token) return res.status(403).send({err:'token wrong, access denied'});
            var start=user.storedAdminCoinsLogs.start, end=user.storedAdminCoinsLogs.end;
            db.withdraw.find({_t:{$gt:start, $lte:end}}).toArray(function(err, r) {
                if (err) return res.status(502).send({err:err});
                debugout(start, end, r);
                exportXls(req, res, r, toDateString(start, true)+'-'+toDateString(end, true),{
                    from:'用户ID',
                    _t:'时间',
                    nickname:'用户名',
                    coins:'账户余额',
                    user:'姓名',
                    card:'卡号',
                    name:'银行',
                    province:'省',
                    city:'市',
                    distribution:'支行',
                    mobi:'手机',
                    fee:'手续费',
                });
            });
        });
    }));
    router.all('/upxlsx', function(req, res) {
        var buffers = [], userid=null;
        var busboy=new Busboy({headers:req.headers});
        busboy.on('file', function(fieldname, file, filename, encoding, mimetype) {
            file.on('data', function(data) {
                buffers.push(data);
            });
            file.on('end', function() {
                var buffer = Buffer.concat(buffers);
                var wb = XLSX.read(buffer, {type:"buffer"});
                var target_sheet = (wb.SheetNames||[""])[0];
                var ws = wb.Sheets[target_sheet];
                var obj=XLSX.utils.sheet_to_json(ws,{});
                userid && User.fromID(userid, function(err, user) {
                    if (err) return res.send({err:err}).end();
                    user.storedUploadToken={token:randstring(),data:obj};
                    res.send(user.storedUploadToken);
                });
            });
        });
        busboy.on('field', function(fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) {
            if (fieldname=='id') userid=val;
        });
        req.pipe(busboy);
    });
});

router.all('/allprovince', httpf(function() {
    return allbank.provinces;
}));
router.all('/allcity', httpf({p:'string'}, function(p) {
    return allbank[p]?allbank[p].cities:undefined;
}));
router.all('/autocomplete_branch', httpf({s:'string', p:'any', c:'any'}, function(s, p, c) {
    if (p) {
        if (allbank[p]) {
            if (allbank[p][c]) return match(s, allbank[p][c].banks);
            return match(s, allbank[p].banks);
        }
    }
    return match(s, allbank.banks);
}));

module.exports=router;

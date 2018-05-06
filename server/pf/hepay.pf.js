var express = require('express');
var crypto = require('crypto'),argv=require('yargs').argv, debugout=require('debugout')(argv.debugout);;
var router = express.Router();
var qs=require('querystring').stringify, url=require('url'), clone=require('clone'), sortObj=require('sort-object'), md5=require('md5');
var httpf=require('httpf'), path=require('path'), merge=require('gy-merge');
var getDB=require('../db.js'), ObjectID = require('mongodb').ObjectID;
var User=require('../User.js');
var _=require('lodash'),async=require('async'), request=require('request');

const merchant_id='72378478816792576', merchant_key='1f17d2a3fcad856c92fe8cf9536c6798';
function combineObj(o) {
    var r='';
    for (var k in o) {
        r+=k+'='+o[k]+'&';
    }
    return r;
}
function signObj(o, forceSign) {
    var o=sortObj(clone(o));
    _.without(['sign', 'extra', 'biz_code', 'card_no','type', 'bank_firm_no', 'bank_firm_name', 'city', 'province'], forceSign).forEach(function(key) {if (o[key]) delete o[key];});
    var str =combineObj(o)+merchant_key, s=md5(str).toUpperCase();
    return s;
}
function makeSigned(o, forceSign) {
    o.sign=signObj(o, forceSign);
    return o;
}
router.all('/sign', httpf({orderid:'string', money:'number', type:'number', callback:true}, function(orderid, money, type, callback){
    // debugout(this.req.headers);
	if (this.req.headers['referer']) {
        var header=url.parse(this.req.headers['referer']);
        header.pathname=path.join(header.pathname, this.req.baseUrl, this.req.path);
    } else {
        var header=url.parse(this.req.originalUrl);
        header.protocol=this.req.protocol+':';
        header.host=this.req.headers['host'];
    }
    header.search=header.path=undefined;
    var supportedMethod=['1010','1000', '1013'];
    if (type<0 || type>=supportedMethod.length) type=0;
    var o={
        order_id:orderid,
        merchant_id:merchant_id,
        order_amt:''+money*100,
        return_url:url.format(merge.recursive(true, header, {pathname: url.resolve(header.pathname, 'rc') })),
        bg_url:url.format(merge.recursive(true, header, {pathname: url.resolve(header.pathname, 'pay') })),
        biz_code:supportedMethod[type]
    };
    o.sign=signObj(o);
    debugout(o);
    callback(null, o);
}));
router.all('/rc', function(req, res) {
    res.send('充值完成，请返回游戏');
});
getDB(function(err, db) {
	if (err) return router.use(function(req,res) {
		res.send({err:err});
	});
    router.all('/pay', httpf({order_id:'string', order_amt:'number', state:'number', sign:'string', callback:true}, function(orderid, amount, state, sign, callback) {
        debugout(this.req.body, this.req.query);
        try {
            if (state!=0) return callback(null, httpf.text('ok'));
            var self=this;
            if (signObj(this.req.body)!=sign) return callback(null, httpf.text('sign err'));
            confirmOrder(orderid, amount/100, self.req.ip, function(err) {
                try {
                    if (err) {
                        debugout('confirm order err', err);
                        return callback(null, httpf.text(err.toString()));
                    }
                    callback(null, httpf.text('ok'));
                } catch(e) {debugout('confirmorder excp', e)};
            });
        } catch(e) {
            debugout(e);
        } 
	}));
});

router.all('/balance', httpf({callback:true}, function(callback) {
    var url='http://hf.qzwygl.cn/biz_inter_sys/services/order/balanceQuery';
    async.map([1001, 1003,1012,1000,1011,1010,1013],
    function(biz_code, cb) {
        request.post(url, {form:makeSigned({biz_code:''+biz_code, merchant_id:merchant_id})}, function(err, response, data) {
            if (err) return cb(err);
            if (data) {
                try{
                    data=JSON.parse(data);
                }catch(e) {return cb(e)}
                cb(null, data);
            }
        })
    },
    function(err, r) {
        if (err) return callback(err);
        var t=0;
        for (var i=0; i<r.length; i++) {
            var n=Number(r[i].balance)/100;
            if (isNaN(n)) continue;
            t+=n;
        }
        callback(null, t);
    });
}));
router.all('/payback',function(req, res) {
    res.send({err:'not impl'});
})
module.exports=router;
!function(n){function t(e){if(c[e])return c[e].exports;var i=c[e]={exports:{},id:e,loaded:!1};return n[e].call(i.exports,i,i.exports,t),i.loaded=!0,i.exports}var c={};return t.m=n,t.c=c,t.p="",t(0)}({0:function(n,t,c){"use strict";var e=c(257),i=window.splash=$("<div/>");i.width($(window).width()),i.height($(window).height()),i.css("background-color","#fff"),i.css("text-align","center"),i.css("display","table-cell"),i.css("vertical-align","middle"),$("body").append(i);var o=$('<img src="'+e+'"/>');o.one("load",function(){o[0].width>i[0].clientWidth?(i.css("background-image",'url("'+e+'")'),i.css("background-position","center"),i.css("background-size",o.width+"px")):(o.css("width","80%"),i.append(o))});var s=window.loadScript=function(n,t){jQuery.ajax({crossDomain:!0,dataType:"script",url:n,cache:!0,success:function(){"function"==typeof t&&t()},error:function(n){"function"==typeof t&&t(n)}})};$.get("manifest.json?t="+(new Date).getTime(),function(n){s(n["entry.js"])},"json")},257:function(n,t,c){n.exports=c.p+"company.jpg?1cb147b792d67001ec18166bf901d46c"}});
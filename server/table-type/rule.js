function permutator(inputArr) {
  var results = [];

	function permute(arr, memo) {
		var cur, memo = memo || [];

		for (var i = 0; i < arr.length; i++) {
			cur = arr.splice(i, 1);
			if (arr.length === 0) {
			results.push(memo.concat(cur));
			}
			permute(arr.slice(), memo.concat(cur));
			arr.splice(i, 0, cur[0]);
		}

		return results;
	}

	return permute(inputArr);
}

var cardType={'黑桃':3, '红桃':2, '梅花':1, '方块':0, 'heitao':3, 'hongtao':2, 'meihua':1, 'fangkuai':0};
function cardv(c) {
	if (typeof c=='number') return {t:Math.floor(c%4), v:Math.floor(c/4), ov:c};
	if (typeof c=='string') {
		for (var k in cardType) {
			if (c.indexOf(k)==0) {
				var t=cardType[k];
				var v=c.slice(k.length);
				switch (v.toLowerCase()) {
					case 'a':
					v=0;
					break;
					case 'j':
					v=10;
					break;
					case 'q':
					v=11;
					break;
					case 'k':
					v=12;
					break;
					default:
					v=Number(v)-1;
				}
				return {t:t, v:v, ov:v*4+t};
			}
		}
	}
}
var reverseCardType=['方块', '梅花','红桃', '黑桃'];
var reverseCardValue=['A', 2, 3, 4, 5, 6, 7, 8, 9,10, 'J', 'Q', 'K'];
var niuValue=[,'一','二','三','四','五','六','七','八','九'];
function parseR(r) {
	return r;
}
function fixv(v) {
	if (v>=10) return 10;
	return v+1;
}
// 
// 返回点数 A1，～10, J, Q, K 算0
function calcR(arr) {
	var r=0;
	for (var i=0; i<arr.length; i++) {
		arr[i].fv=fixv(arr[i].v);
		r+=arr[i].fv;
	}

	return Math.floor(r%10);
}

module.exports={
	calcR:calcR,
	parseR:parseR,
	cardv:cardv,
	fixv:fixv
}

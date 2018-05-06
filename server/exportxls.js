var XLSX = require('xlsx');

/**
 * 
 * @param {express.req} req 
 * @param {express.res} res 
 * @param {[{},{}]} objArr 
 */
module.exports=function (req, res, objArr, filename, transMap) {
    var title=[], data=[];
    for (var i=0; i<objArr.length; i++) {
        var item=objArr[i];
        var idx=0;
        var _d=[];
        data[i]=_d;
        for (var k in item) {
            if (!title[idx]) title[idx]=(transMap?transMap[k]:null)||k;
            idx++;
            _d.push(item[k]);
        }
    }
	var wb = make_book([title].concat(data));
	/* send buffer back */
    res.status(200)
    .set(
        {'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition':`inline; filename="${filename}.xlsx"`
    })
    .send(XLSX.write(wb, {type:'buffer', bookType:'xlsx'}));
}
/* helper to generate the workbook object */
function make_book(data) {
	var ws = XLSX.utils.aoa_to_sheet(data);
	var wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, "SheetJS");
	return wb;
}

module.exports = function(cards){
  if(cards)
    this.cards = cards;
  else
    this.cards = [];

  this.init =function() {
    this.cards=[];
  }
  this.push = function(card){
    if (card==null) throw(new Error('card is null|undefined'));
    this.cards.push(card);
  };

  this.toString = function(){
    var ret = [];
    for(var i = 0; i < this.cards.length; i++)
      //if(hideFirstCard && i === 0)
      //  ret.push('??');
      //else
        ret.push(this.cards[i].toShortDisplayString());
    return ret.join(',');
  };

  this.score = function(target){
    return this.value();
  };

  this.value = function(){
    var ret = 0;
    for(var i = 0; i < this.cards.length; i++){
      var card = this.cards[i];
      if (!card) {
        console.log(this.cards, i);
      }
      if(card.description.toLowerCase() === 'ace')
        ret += 1;
      else if(card.sort >= 10)
        ret += 0;
      else
        ret += card.sort;
    }
    return ret % 10;
  };
};
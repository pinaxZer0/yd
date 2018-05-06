var shuffle = require('gy-shuffle'),
    baccaratHand = require('./baccarat-hand'),
    EventEmitter = require('events').EventEmitter,
    util = require('util');

function Game() {
  EventEmitter.call(this);
  
  var pThirdCard = -1;
  var playerThirdCard;
  
  var shoe, player, banker;

  var game = this;
  this.onPlayerInputNeeded;
  this.onEnd;
  var player=this.player=new baccaratHand();
  var banker=this.banker=new baccaratHand();

  var handsPlayed = 0;

//   this.begin = function() {
//    while(shoe.length >= 14) {
//      console.log("-----------------");
//      handsPlayed++;
//      banker = new baccaratHand();
//      player = new baccaratHand();
//      shoe.deal(2, [player, banker]);
//      displayGameStatus();
//      checkNaturals();
//      console.log("-----------------");
//    }
  
//    console.log("Hands Played : " + handsPlayed);
//    game.emit('end');
//   };

  this.begin = function() {
    shoe = shuffle.shuffle({numberOfDecks: 8});

    // console.log("========================================");
    // console.log("Starting New Shoe.");
    var burnCard = shoe.draw();
    var burnCardValue = 0;

    if(burnCard.description.toLowerCase() === 'ace')
      burnCardValue = 1;
    else if(burnCard.sort >= 10)
      burnCardValue = 10;
    else
      burnCardValue = burnCard.sort;
    
    game.emit('burn', {burnCard:burnCard, burnMore:burnCardValue});

    // console.log("Burn Card : " + burnCard.toShortDisplayString() + ". Burning " + (burnCardValue + 1) + " for " + burnCardValue);
    for(var i = 1 ; i <= burnCardValue ; i++)
      shoe.draw();
    // console.log("Shoe length : " + shoe.length);
    // console.log("========================================");
    game.leftCards=shoe.length;
  };

  this.playHand =function() {
    // console.log("-----------------");
    handsPlayed++;
    banker.init();
    player.init();
    shoe.deal(2, [player, banker]);
    game.emit('draw', {player:player, banker:banker});
    displayGameStatus();
    checkNaturals();
    // console.log("-----------------");
  }

  function checkNaturals() {
    var playerScore = player.s=player.score();
    var bankerScore = banker.s=banker.score();

    var r={playerPair:false, bankerPair:false};
    if (player.cards[0].sort==player.cards[1].sort) r.playerPair=true; 
    if (banker.cards[0].sort==banker.cards[1].sort) r.bankerPair=true;

    if (playerScore === 8 && bankerScore < 8) {
      // console.log('P');
      r.playerTian=true;
      r.win='player';
    } else if (playerScore === 9 && bankerScore < 9) {
      // console.log('P');
      r.playerTian=true;
      r.win='player';
    } else if (bankerScore === 8 && playerScore < 8) {
      // console.log('B');
      r.bankerTian=true;
      r.win='banker';
    } else if (bankerScore === 9 && playerScore < 9) {
      // console.log('B');
      r.bankerTian=true;
      r.win='banker';
    } else if (bankerScore === 8 && playerScore === 8) {
      // console.log('T');
      r.bankerTian=r.playerTian=true
      r.win='tie';
    } else if (bankerScore === 9 && playerScore === 9) {
      // console.log('T');
      r.bankerTian=r.playerTian=true
      r.win='tie';
    } else {
      return thirdCardDraw();
    }
    game.emit('result', r);
  }

  function thirdCardDraw() {
    var playerScore = player.score();
    var bankerScore = banker.score();

    // When player score is < 6
    if (playerScore < 6 && playerScore >= 0) {
      // console.log("Drawing third card for player");
      playerThirdCard = shoe.draw();
      player.push(playerThirdCard);
      game.emit('draw', {player:player});

      // Check banker drawing rules if third card between 0 and 9...
      pThirdCard = playerThirdCard.sort;
      if(pThirdCard >= 0 && pThirdCard <= 9) {
        if (bankerScore === 3 && pThirdCard != 8 ) {
          // console.log("Banker 3 and player third Card is not 8");
          var bankerThirdCard = shoe.draw();
          banker.push(bankerThirdCard);
          game.emit('draw', {banker:banker});
          return checkWinner();
        } else if (bankerScore === 4 && (
            pThirdCard >= 2 && pThirdCard <= 7 )) {
          // console.log("Banker 4 and player third card between 2 and 7");
          var bankerThirdCard = shoe.draw();
          banker.push(bankerThirdCard);
          game.emit('draw', {banker:banker});
          return checkWinner();
        } else if (bankerScore === 5 && (
            pThirdCard >= 4 && pThirdCard <= 7 )) {
          // console.log("Banker 5 and player third card between 4 and 7");
          var bankerThirdCard = shoe.draw();
          banker.push(bankerThirdCard);
          game.emit('draw', {banker:banker});
          return checkWinner();
        } else if (bankerScore === 6 && (
            pThirdCard >= 6 && pThirdCard <= 7 )) {
          // console.log("Banker 6 and player 3rd card between 6 and 7");
          var bankerThirdCard = shoe.draw();
          banker.push(bankerThirdCard);
          game.emit('draw', {banker:banker});
          return checkWinner();
        }
      }
    }

    if(bankerScore >= 0 && bankerScore <= 5) {
      // console.log("bankerscore between 0 and 5");
      var bankerThirdCard = shoe.draw();
      banker.push(bankerThirdCard);
      game.emit('draw', {banker:banker});
      return checkWinner();
    } else {
      // None of the condition satisfied
      // console.log("None of the conditions satisfied.");
      return checkWinner();
    }
  }

  function checkWinner() {
    var playerScore = player.s=player.score();
    var bankerScore = banker.s=banker.score();
    var r={playerPair:false, bankerPair:false};
    if (player.cards[0].sort==player.cards[1].sort) r.playerPair=true; 
    if (banker.cards[0].sort==banker.cards[1].sort) r.bankerPair=true;
    if (playerScore > bankerScore) {
      displayGameStatus();
      // console.log('P');
      r.win='player';
      //game.emit('input', handleInput);
    } else if (bankerScore > playerScore) {
      displayGameStatus();
      // console.log('B');
      r.win='banker';
      //game.emit('input', handleInput);
    } else {
      displayGameStatus();
      // console.log('T');
      r.win='tie';
      //game.emit('input', handleInput);
    }
    game.emit('result', r);
  }

  function displayGameStatus() {
    // console.log('Player: %s (%d)', player.toString(), player.score());
    // console.log('Banker: %s (%d)', banker.toString(), banker.score());
    // console.log("Deck Size : " + shoe.length);
    game.leftCards=shoe.length;
  }
}

util.inherits(Game, EventEmitter);
module.exports = Game;

if (module==require.main) {
    var BaccaratGame = Game;
    for (var i=0; i<100; i++) {
      var game = new BaccaratGame();
      game.begin();
      game.on('result', function(detail) {
        console.log(detail);
        process.nextTick(function() {
          if (game.leftCards<14) game.begin();
          game.playHand();  
        })
      })
      game.playHand();
    }

    // input = process.openStdin();

    // input.setEncoding('utf8');

    // game.on('input', function(callback){
    //     input.once('data', function(command){
    //         callback(command.substring(0, command.length -1));
    //     });
    // })
    // .on('burn', console.log)
    // .on('draw', console.log)
    // .on('result', console.log)
    // .on('end', function(){
    //     input.destroy();
    // });
    // game.begin();

}
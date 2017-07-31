const Discord = require("discord.js");
const ytdl = require('ytdl-core');
const ypi = require('youtube-playlist-info');
const config = require('./config')
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var EventEmitter = require('events').EventEmitter;
var addToQueue = new EventEmitter();
var queue = [];
//express


//Login discord
const client = new Discord.Client();

client.login(config.discord_token);

client.on('ready', function() {
    console.log('Bot connecté en tant que ' + client.user.username);
});

// Chargement du fichier index.html affiché au client
app.use(express.static(__dirname + '/public'));

app.get('/', function(req, res,next) {
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket) {
  console.log('Un client s\'est connecté...');
  socket.on('disconnect', function() {
    console.log('Un client s\'est déconnecté');
  });

  socket.emit('stop');
  socket.emit('play', queue);

  socket.on('stop_button', function(data) {
    queue = [];
    socket.emit('stop')
  });



  //Récupérer le lien youtube
  socket.on('youtube_link', function(youtube_link) {
    if (/(?:https?:\/\/)?(?:www\.)?youtu\.?be(?:\.com)?\/?.*(?:watch|embed)?(?:.*v=|v\/|\/)([\w\-_]+)\&?/.test(youtube_link)) {

      //Ajouter à la file d'attente
      if(youtube_link.search('playlist') < 0) {
        queue.push(youtube_link);
        var playlistFirst = false;
        addToQueue.emit('finished');
      } else {
        if (queue = []) {
          var playlistFirst = true
        }
        let playlistIdPosition = youtube_link.search('playlist');
        playlistIdPosition += 14;
        var playlistId = youtube_link.substr(playlistIdPosition, youtube_link.length - 1);
        ypi.playlistInfo(config.youtube_key, playlistId, function(playlistItem) {
          for(var i = 0; i < playlistItem.length; i++) {
            queue.push('https://www.youtube.com/watch?v=' + playlistItem[i].resourceId.videoId);
          }
          addToQueue.emit('finished');
        });
      }
    } else {
      socket.emit('erreur', 'Erreur, vous devez entrer un lien youtube')
    }

    //Lancer la musique sur discord
    addToQueue.on('finished', function() {
      socket.emit('play', queue);
      if (queue.length == 1 || playlistFirst == true) {
        client.guilds.get('136182197051719680').members.get('136181701733777409').voiceChannel.join().then(function(connection) {
          let stream = ytdl(queue[0]);
          connection.playStream(stream);
          stream.on('error', function() {
            connection.disconnect();
          });

          stream.on('end', function() {
            if (queue == []) {
              connection.disconnect();
              socket.emit('play');
            } else {
              console.log('test');
              queue.shift();
              socket.emit('play', queue)
              stream = ytdl(queue[0]);
              connection.playStream(stream)
            }
          });

          socket.on('stop_button', function(data) {
            socket.emit('stop')
            queue = [];
            stream.destroy();
            connection.disconnect();
          });
        });
      }
    });
  });
});


server.listen(4242);

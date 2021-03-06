﻿const Discord = require("discord.js");
const youtubeStream = require('youtube-audio-stream');
const ypi = require('youtube-playlist-info');
const fetchVideoInfo = require('youtube-info');
const bodyParser = require('body-parser')
const config = require('./config')
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);
const EventEmitter = require('events').EventEmitter;
const addToQueue = new EventEmitter();
var queue = [];
var queueMeta = [];
var playlistPlayFirst = false;
//express


//Login discord
const client = new Discord.Client();

client.login(config.discord_token);

client.on('ready', function() {
    console.log('Bot connecté en tant que ' + client.user.username);
});

client.on('message', function(msg) {
    if (msg.channel.type == 'dm') {
      if (msg.content === 'join') {
        try {
          client.guilds.get('136182197051719680').members.get(msg.author.id).voiceChannel.join();
        } catch (e) {
          msg.reply('Vous devez être connecté dans un channel.')
        }
      } else if (msg.content === 'disconnect') {
        try {
          client.guilds.get('136182197051719680').members.get(msg.author.id).voiceChannel.leave();
        } catch (e) {
          msg.reply('Vous devez être connecté dans un channel et le bot diot être dans le même channel que vous.')
        }
      }  
    }
});

// Chargement du fichier index.html affiché au client
app.use(express.static(__dirname + '/public'));
app.use( bodyParser.json() );
app.use(bodyParser.urlencoded({
  extended: true
}));

app.get('/', function(req, res, next) {
    res.sendFile(__dirname + '/password.html');
    app.post('/', function(req, res, next) {
        if (req.body.password === config.password) {
            res.sendFile(__dirname + '/index.html');
        }
    });
});

io.on('connection', function(socket) {
  console.log('Un client s\'est connecté...');
  socket.on('disconnect', function() {
    console.log('Un client s\'est déconnecté');
  });

  socket.emit('play', queueMeta);

  socket.on('stop_button', function() {
    queue = [];
    queueMeta = [];
    socket.emit('play', queueMeta);
    try {
      client.voiceConnections.first().disconnect();
    } catch (e) {
    }
  });

  socket.on('remove_button', function(data) {
    queue.splice(data.elementToDelete, 1);
    queueMeta.splice(data.elementToDelete, 1);
    socket.emit('play', queueMeta);
  });

  //Récupérer le lien youtube
  socket.on('youtube_link', function(youtube_link) {
    if (/(?:https?:\/\/)?(?:www\.)?youtu\.?be(?:\.com)?\/?.*(?:watch|embed)?(?:.*v=|v\/|\/)([\w\-_]+)\&?/.test(youtube_link)) {

      //Ajouter à la file d'attente
      if (client.voiceConnections.first() != undefined) {
        if(youtube_link.search('playlist') < 0) {
          queue.push(youtube_link);
          var videoId = youtube_link.split('v=')[1];
          var ampersandPosition = videoId.indexOf('&');
          if(ampersandPosition != -1) {
            videoId = videoId.substring(0, ampersandPosition);
          }
          fetchVideoInfo(videoId)
          .then(function(videoInfos) {
            queueMeta.push({ title: videoInfos.title });
            socket.emit('play', queueMeta);
            addToQueue.emit('finished');
          });
        } else {
          if (queue.length === 0) {
            playlistPlayFirst = true;
          }
          let playlistIdPosition = youtube_link.search('playlist');
          playlistIdPosition += 14;
          var playlistId = youtube_link.substr(playlistIdPosition, youtube_link.length - 1);
          ypi.playlistInfo(config.youtube_key, playlistId, function(playlistItem) {
            for(var i = 0; i < playlistItem.length; i++) {
              queue.push('https://www.youtube.com/watch?v=' + playlistItem[i].resourceId.videoId);
              queueMeta.push({ title: playlistItem[i].title});
            }
            socket.emit('play', queueMeta);
            addToQueue.emit('finished');
          });
        }
      } else {
        socket.emit('erreur', "Erreur, le bot n'est pas connecté");
      }
      
    } else {
      socket.emit('erreur', 'Erreur, vous devez entrer un lien youtube')
    }

    //Lancer la musique sur discord
    addToQueue.on('finished', function() {
      if (queue.length === 1 || playlistPlayFirst === true) {
        playlistPlayFirst = false;
        try {
          let connection = client.voiceConnections.first();
          let stream = youtubeStream(queue[0]);
          connection.playStream(stream);

          stream.on('end', function() {
            if (queue.length == 1) {
              queue.shift();
              queueMeta.shift();
              connection.disconnect();
              socket.emit('play', queueMeta);
            } else {
              queue.shift();
              queueMeta.shift();
              stream = youtubeStream(queue[0]);
              connection.playStream(stream);
              socket.emit('play', queueMeta);
            }
          });

          socket.on('stop_button', function() {
            try {
              stream.end();
            } catch(exception) {
              console.log(exception);
            }

          });
      } catch (e) {
        socket.emit('erreur', 'Erreur, le bot n\'est connecté dans aucun channel');
        queue = [];
        queueMeta = [];
        socket.emit('play', queueMeta);
      }
      }
    });
  });
});


server.listen(4242);

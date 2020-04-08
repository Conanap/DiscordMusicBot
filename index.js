const ytdl = require('ytdl-core');
const Discord = require('discord.js');
const {
    prefix,
    token
} = require('./config.json');

const client = new Discord.Client();
client.login(token);

const fetch = require("node-fetch");
const apiKey = "AIzaSyAHrrwsRNbBIGELxhlu9qZwdT5NImBSbDE";
const url = "https://www.googleapis.com/youtube/v3/search?part=id&key=" + apiKey + "&q=";
const vurl = "https:www.youtube.com/watch?v=";

function sendReq(query, message, serverQueue) {
    console.log("fetching results");
    fetch(url + query)
        .then(data=>{ return data.json();})
        .then(res=>{enqueue(res, message, serverQueue)});
};

let states = {
    DC: 0,
    CONNECTED: 1,
    PLAYING: 2,
    PAUSED: 3
};

let botFuncs = {};
//botFuncs[`${prefix}h`] = botFuncs[`${prefix}help`] = help;
botFuncs[`${prefix}play`] = execute;
//botFuncs[`${prefix}p`] = togglePlay;
//botFuncs[`${prefix}stop`] = botFuncs[`${prefix}pause`] = pause;

let botState = states.DC;

const queue = new Map();

client.once('ready', () => { console.log('Ready'); console.log(`Prefix: ${prefix}`); });

client.once('reconnecting', () => { console.log('Reconnecting...'); });

client.once('disconnect', () => { console.log('Disconnected'); });

client.on('message', async message => {

    console.log('Message: ' + message.content);
    console.log("First argument: " + message.content.split(" ")[0] + " ," + message.content.split(" ")[0].length);

    if(message.author.bot) return;

    if(!message.content.startsWith(prefix)) return;

    const serverQueue = queue.get(message.guild.id);

    if(message.content.split(" ")[0][0] !== `${prefix}` || Object.keys(botFuncs).indexOf(message.content.split(" ")[0]) === -1) {
        console.log('invalid command received: ', message.content.split(" ")[0]);
        return;
    }

    if(!message.member.voice.channel) {
        console.log(message.member.voice.channel);
        return message.channel.send('You must be in a voice channel to send a Skynet command.');
    }

    console.log("First argument: " + message.content.split(" ")[0]);

    botFuncs[message.content.split(" ")[0]](message, serverQueue);
});

async function execute(message, serverQueue) {
    console.log('Play command received; not toggle.');

    const args = message.content.split(" ");

    if(!message.member.voice.channel) {
        // join channel here
    }

    const permissions = message.member.voice.channel.permissionsFor(message.client.user);

    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        return message.channel.send(
          "I need the permissions to join and speak in your voice channel!"
        );
    }

    sendReq(args.slice(1, args.length + 1).join('+'), message, serverQueue);

};

async function enqueue(response, message, serverQueue) {
    console.log('Enqueue.');

    const results = response.items;
    if(results.length === 0) {
        return message.channel.send('No matching query found.');
    }

    const vID = results[0].id.videoId;
    console.log('Getting video from vID');
    const songInfo = await ytdl.getInfo(vurl + vID);
    const song = {
        title: songInfo.title,
        url: songInfo.video_url
    }

    console.log('Server queue check');

    if(!serverQueue) {
        console.log('Creating server queue');

        const queueContruct = {
            textChannel: message.channel,
            voiceChannel: message.member.voice.channel,
            connection: null,
            songs: [],
            volume: 5,
            playing: true
        };
    
        queue.set(message.guild.id, queueContruct);
    
        queueContruct.songs.push(song);
    
        try {
            var connection = await message.member.voice.channel.join();
            queueContruct.connection = connection;
            play(message.guild, queueContruct.songs[0]);
        } catch (err) {
            console.log(err);
            queue.delete(message.guild.id);
            return message.channel.send(err);
        }
    } else {
        console.log('Adding to server queue');
        serverQueue.songs.push(song);
        console.log(serverQueue.songs);
        return message.channel.send(`${song.title} has been added to the queue.`);
    }
};

function play(guild, song) {
    console.log('Playing audio');

    const serverQueue = queue.get(guild.id);
    if(!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }

    console.log(song.url);
    const dispatcher = serverQueue.connection
        .play(ytdl(song.url, { filter: 'audioonly'}))
        .on("finish", () => {
        serverQueue.songs.shift();
        play(guild, serverQueue.songs[0]);
        })
        .on("error", error => console.error(error));
    // dispatcher.setVolumeLogarithmic(serverQueue.volume);
    serverQueue.textChannel.send(`Now playing: ${song.title}`);
};

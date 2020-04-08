const args = process.argv.slice(2);
const isDev = args.indexOf('-dev') === -1 ? false : true;
const isDebug = args.indexOf('-debug') === -1 ? false : true;

const ytdl = require('ytdl-core');
const Discord = require('discord.js');
let {
    prefix,
    developerPrefix,
    token,
    developerToken
} = require('./config.json');

const otPrefixes = ['!', '>', isDev ? prefix : developerPrefix];
prefix = isDev ? developerPrefix : prefix;

const client = new Discord.Client();
isDev ? client.login(developerToken) : client.login(token);

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

const states = {
    DC: 0,
    CONNECTED: 1,
    PLAYING: 2,
    PAUSED: 3
};

let dispatcher = undefined;
let currentSong = undefined;

let botFuncs = {};
botFuncs[`${prefix}h`] = botFuncs[`${prefix}help`] = help;
botFuncs[`${prefix}play`] = execute;
botFuncs[`${prefix}p`] = togglePlay;
botFuncs[`${prefix}stop`] = botFuncs[`${prefix}pause`] = pause;
botFuncs[`${prefix}skip`] = botFuncs[`${prefix}s`] = skip;
botFuncs[`${prefix}resume`] = botFuncs[`${prefix}r`] = resume;

let botState = states.DC;

const queue = new Map();

client.once('ready', () => { console.log('Status: Ready'); console.log(`Prefix: ${prefix}`); isDev ? console.log('DEVELOPER VEDA') : 1; });

client.once('reconnecting', () => { console.log('Status: Reconnecting...'); });

client.once('disconnect', () => { console.log('Status: Disconnected'); botState = states.DC; });

client.on('message', async message => {

    console.log('Log: Message: ' + message.content);
    console.log("Log: First argument: " + message.content.split(" ")[0] + " ," + message.content.split(" ")[0].length);

    if(message.author.bot) return;

    if(otPrefixes.indexOf(message.content.split(" ")[0][0]) !== -1) {
        return;
    }

    if(message.content.split(" ")[0][0] !== `${prefix}`) {
        console.log('Log: Message deleted: ', message.content);
        return message.delete();
    }

    if(Object.keys(botFuncs).indexOf(message.content.split(" ")[0]) === -1) {
        console.log('Error: Unrecognized command: ', message.content.split(" ")[0]);
        return message.channel.send('Unrecognized command: ' + message.content.split(" ")[0]);
    }

    if(message.content === `${prefix}h` || message.content === `${prefix}help`) {
        return help(message, undefined);
    }

    if(!message.member.voice.channel) {
        console.log(message.member.voice.channel);
        return message.channel.send('You must be in a voice channel to send a music related command to Veda.');
    }

    console.log("Log: command: " + message.content.split(" ")[0]);

    const serverQueue = queue.get(message.guild.id);
    botFuncs[message.content.split(" ")[0]](message, serverQueue);
});

async function execute(message, serverQueue) {
    console.log('Status: Play command received; not toggle.');

    const args = message.content.split(" ");
    const permissions = message.member.voice.channel.permissionsFor(message.client.user);

    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        console.log('Error: No permission to connect or speak.');
        return message.channel.send(
          "I need the permissions to join and speak in your voice channel!"
        );
    }

    sendReq(args.slice(1, args.length + 1).join('+'), message, serverQueue);

};

async function enqueue(response, message, serverQueue) {
    console.log('Status: Enqueue.');

    const results = response.items;
    if(results.length === 0) {
        return message.channel.send('No matching query found.');
    }

    const vID = results[0].id.videoId;
    console.log('Log: Getting video from vID');
    const songInfo = await ytdl.getInfo(vurl + vID);
    const song = {
        title: songInfo.title,
        url: songInfo.video_url
    }

    console.log('Log: Server queue check');

    if(!serverQueue) {
        console.log('Log: Creating server queue');

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
            botState = states.CONNECTED;
            queueContruct.connection = connection;
            play(message.guild, queueContruct.songs[0]);
        } catch (err) {
            console.log(err);
            queue.delete(message.guild.id);
            return message.channel.send(err);
        }
    } else {
        console.log('Log: Adding to server queue');
        serverQueue.songs.push(song);
        console.log(serverQueue.songs);
        return message.channel.send(`${song.title} has been added to the queue.`);
    }
};

function play(guild, song) {
    console.log('Status: Playing audio');

    currentSong = song;

    const serverQueue = queue.get(guild.id);
    if(!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }

    console.log(song.url);
    dispatcher = serverQueue.connection
        .play(ytdl(song.url, { filter: 'audioonly'}))
        .on("finish", () => {
        serverQueue.songs.shift();
        play(guild, serverQueue.songs[0]);
        })
        .on("error", error => console.error(error));
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
    serverQueue.textChannel.send(`Now playing: ${song.title}`);
    botState = states.PLAYING;
};

function skip(message, serverQueue) {
    if (!serverQueue)
        return message.channel.send('The queue is already clear.');
    serverQueue.connection.dispatcher.end();
    dispatcher = undefined;
};

function togglePlay(message, serverQueue) {
    if(message.content.split(" ").length > 1) {
        execute(message, serverQueue);
    } else if(botState === states.PAUSED) {
        resume(message, serverQueue);
    } else if(botState === states.PLAYING) {
        pause(message, serverQueue);
    }
};

function pause(message, serverQueue) {
    if(botState !== states.PLAYING) {
        return serverQueue.textChannel.send('Cannot pause when no music is being played.');
    }

    if(dispatcher) {
        dispatcher.pause();
        botState = states.PAUSED;
        console.log('Status: Paused playback.');
        return serverQueue.textChannel.send(`Paused.`);
    }
    console.log('Error: Dispatcher not found.');
    return serverQueue.textChannel.send('Error: Unable to complete action. Please report this to the administrator: Dispatcher not found.');
};

function resume(message, serverQueue) {
    if(botState !== states.PAUSED) {
        return serverQueue.textChannel.send('Cannot resume playback when no music has been paused.');
    }

    if(dispatcher) {
        botState = states.PLAYING;
        dispatcher.resume();
        console.log('Status: Resumed playing.');
        return serverQueue.textChannel.send(`Resumed playing: ${currentSong.title}`);
    }
    console.log('Error: Dispatcher not found.');
    return serverQueue.textChannel.send('Error: Unable to complete action. Please report this to the administrator: Dispatcher not found.');
}

// help
function help (message, serverQueue) {
    const helpMsg =
`Hello! I am Veda. These are my current functionalities:
    - Play music.

My command prefix is '-'.

Documentation notes:
    - [...] denotes optional arguments.
    - Capitalization denotes required arguments.
    - \`...\` denotes a command.

These are the available commands:
    - play NAME: search Youtube for NAME and play the top result.
    - resume: resumes playback.
    - skip: skip current song.
    - help: shows this help message.

Shorthands (If you get confused, use above full commands):
    - p NAME: same as \`play NAME\`.
    - p: resume or pause music.
    - r: resumes playback.
    - s: same as \`skip\`.
    - h: same as \`help\`.
`;

    return message.channel.send(helpMsg);
};  
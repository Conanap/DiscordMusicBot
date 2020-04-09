/*
v1.2
Written by Albion Fung

Refs:
1. https://gabrieltanner.org/blog/dicord-music-bot
2. https://www.online-tech-tips.com/fun-stuff/how-to-make-your-own-discord-music-bot/
3. https://dev.to/galnir/how-to-write-a-music-command-using-the-discord-js-library-462f
4. https://stackoverflow.com
5. https://github.com (issues)

Reqs: Make sure to have a file config.json in the project's root folder. It must contain:
- prefix for the bot
- developerPrefix for the testing bot (can be the same as above prefix if not using a test bot)
- token for the bot
- developerToken for the testing bot (can be the same as above token if not using a test bot)
- API Key for Youtube API v3

You may freely distribute and use my code as long as your code is:
- open source
- credit me
- credit above refs when using my code
- follow the licenses of the modules used, unless you have your own replacement and do
not use the modules I use
- do not directly charge customers for using an application that uses this code base *
- have this same clause for the distribution and integration of your code

*: The code may still be used in a commercial operation as long as it is offered free.
   For example, you may make use of this code in an operation that makes a profit off of
   advertisements, as long as you do not charge users to pay for this code's functionality
   - including the functionality of this code "free" to certain tiers of purchase but not
   others is considered charging the user directly.
*/

const args = process.argv.slice(2);
const isDev = args.indexOf('-dev') === -1 ? false : true;
const isDebug = args.indexOf('-debug') === -1 ? false : true;

const ytdl = require('ytdl-core');
const Discord = require('discord.js');
let {
    prefix,
    developerPrefix,
    token,
    developerToken,
    apiKey
} = require('./config.json');

const otPrefixes = ['!', '>', isDev ? prefix : developerPrefix];
prefix = isDev ? developerPrefix : prefix;

const client = new Discord.Client();
isDev ? client.login(developerToken) : client.login(token);

const fetch = require("node-fetch");
const url = "https://www.googleapis.com/youtube/v3/search?part=id&type=video&key=" + apiKey + "&q=";
const vurl = "https:www.youtube.com/watch?v=";

function sendReq(query, message, serverQueue, func = undefined) {
    console.log("fetching results");
    fetch(url + query)
        .then(data=>{ return data.json();})
        .then(res=>{ if(isDebug) console.log(res);
            func ? func(message, serverQueue) : enqueue(res, message, serverQueue);
        });
};

const states = {
    DC: 0,
    CONNECTED: 1,
    PLAYING: 2,
    PAUSED: 3
};

let dispatcher = undefined;
let currentSong = undefined;
let recentRequestPerUser = {};

let botFuncs = {};
botFuncs[`${prefix}h`] = botFuncs[`${prefix}help`] = help;
botFuncs[`${prefix}play`] = execute;
botFuncs[`${prefix}p`] = togglePlay;
botFuncs[`${prefix}stop`] = botFuncs[`${prefix}pause`] = pause;
botFuncs[`${prefix}skip`] = botFuncs[`${prefix}s`] = skip;
botFuncs[`${prefix}resume`] = botFuncs[`${prefix}r`] = resume;
botFuncs[`${prefix}oops`] = botFuncs[`${prefix}o`] = wrongResult;
botFuncs[`${prefix}UwUops`] = wongWesults;

let botState = states.DC;

const queue = new Map();
const BalPriorityQueue = require('./balanced-priority-queue.js');
const bpq = new BalPriorityQueue(isDebug);

client.once('ready', () => {
    console.log('Status: Ready');
    console.log(`Prefix: ${prefix}`);
    isDev ? console.log('DEVELOPER VEDA') : 1;
    isDebug ? console.log('DEBUG MODE ON') : 1;
});

client.once('reconnecting', () => { console.log('Status: Reconnecting...'); });

client.once('disconnect', () => { console.log('Status: Disconnected'); botState = states.DC; });

client.on('message', async message => {

    console.log('\n\n\nLog: Message: ' + message.content);
    console.log("Log: First argument: " + message.content.split(" ")[0] + " ," + message.content.split(" ")[0].length);

    if(message.author.bot) return;

    // ignore messages meant for other bots
    if(otPrefixes.indexOf(message.content.split(" ")[0][0]) !== -1) {
        return;
    }

    // messages not meant for other bots or myself will be deleted
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
        if(isDebug) console.log(message.member.voice.channel);
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

    // get cached if possible
    let res = await bpq.get(message.content);
    if(res) {
        if(isDebug) console.log('DEBUG: cache match found.');
        res.isCached = true;
        enqueue({items: [res]}, message, serverQueue);
        return;
    } else {
        if(isDebug) console.log('DEBUG: cannot find cache match.');
        sendReq(args.slice(1, args.length + 1).join('+'), message, serverQueue);
    }

};

async function enqueue(response, message, serverQueue) {
    if(isDebug) console.log('DEBUG Status: Enqueue.');

    let results = response.items;
    if(isDebug) console.log('DEBUG: Results in enqueue ', results);
    if(!results || results.length === 0) {
        return message.channel.send('No matching query found.');
    }

    // get song properties
    let song;
    if(results[0].isCached) {
        song = results[0];
        song.requester = message.author.toString();
        song.wrongCount = 0;
    } else {
        const vID = results[0].id.videoId;
        song = await getSong(message, vID, 0);
    }

    bpq.addSong(song);
    recentRequestPerUser[song.requester] = {
        results: results,
        wrongCount: 0,
        song: song
    };

    if(isDebug) console.log('DEBUG Log: Server queue check');

    if(!serverQueue) {
        if(isDebug) console.log('DEBUG Log: Creating server queue');

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
        if(isDebug) console.log('DEBUG Log: Adding to server queue');
        serverQueue.songs.push(song);
        
        if(isDebug) console.log('DEBUG: serverQueue songs ', serverQueue.songs);

        return message.channel.send(`${song.title} has been added to the queue.`);
    }
};

function play(guild, song) {
    console.log('Status: Playing audio');

    // last song they requested, no longer need to keep track
    if(song && recentRequestPerUser[song.requester].results[song.wrongCount].id.videoId
        === song.vID) {
        delete recentRequestPerUser[song.requester];
    }

    currentSong = song;

    const serverQueue = queue.get(guild.id);
    if(!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }

    if(isDebug) console.log('DEBUG: song url ', song.url);
    dispatcher = serverQueue.connection
        .play(ytdl(song.url, { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 25 }))
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

async function wrongResult(message, serverQueue) {
    let songInfo = recentRequestPerUser[message.author.toString()];
    if(!songInfo) {
        return message.channel.send('No song queued.');
    }
    let wrongCount = songInfo.wrongCount + 1 === songInfo.results.length ?
        0 : songInfo.wrongCount + 1;

    const song = songInfo.song;
    if(isDebug) {
        console.log('DEBUG W: song info ', songInfo);
        console.log('DEBUG W: wrongCount ', wrongCount);
        console.log('DEBUG W: song id ', songInfo.results[wrongCount].id);
    }
    const newSong = await getSong(message, songInfo.results[wrongCount].id.videoId, wrongCount);
    songInfo.wrongCount = wrongCount;

    replaceSong(song, newSong, serverQueue);

    if(isDebug) {
        console.log(`DEBUG W: old id ${song.vID} and new id ${newSong.vID}`);
    }
    return message.channel.send(`${song.title} replaced by ${newSong.title}`);
};

async function wongWesults(message, serverQueue) {
    message.channel.send('"You weeb" - Declan 2020');
    wrongResult(message, serverQueue);
};

function replaceSong(song, newSong, serverQueue) {
    const index = serverQueue.songs.map(function(e) { return song.vID; })
    .indexOf(song.vID);
    if(isDebug) {
        console.log('DEBUG replace: replacing song');
        console.log('DEBUG replace: to replace index: ', index)
        console.log('DEBUG replace: old song: ', serverQueue[index]);
    }
    serverQueue[index] = newSong;
    if(isDebug) {
        console.log('DEBUG replace: new song', serverQueue[index]);
    }
};

async function getSong(message, vID, resultID) {
    console.log('Log: Getting video from vID ' + vID);
    const songInfo = await ytdl.getInfo(vurl + vID);
    const song = {
        title: songInfo.title,
        url: songInfo.video_url,
        vID: vID,
        requester: message.author.toString(),
        wrongCount: resultID
    };

    return song;
};

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
    - play URL: go to Youtube URL and play that video.
    - resume: resumes playback.
    - skip: skip current song.
    - help: shows this help message.
    - oops: search for the next best result for **your** last query if songbot queues the wrong song. Only works before it's played.

Shorthands (If you get confused, use above full commands):
    - p NAME: same as \`play NAME\`.
    - p: resume or pause music.
    - r: resumes playback.
    - s: same as \`skip\`.
    - h: same as \`help\`.
    - o: same as \`wrong\`.
`;

    return message.channel.send(helpMsg);
};
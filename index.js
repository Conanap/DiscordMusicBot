/*
v1.2.3
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

// developer options
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
    apiKey,
    BPQ_PATH
} = require('./config.json');

// my server uses ! and > for two rhythm bots as well. Add exclusions as necessary.
const otPrefixes = ['!', '>', isDev ? prefix : developerPrefix];
prefix = isDev ? developerPrefix : prefix;

const client = new Discord.Client();
isDev ? client.login(developerToken) : client.login(token);

const fetch = require("node-fetch");
const url = "https://www.googleapis.com/youtube/v3/search?part=id&type=video&key=" + apiKey + "&q=";
const vurl = "https:www.youtube.com/watch?v=";

// send html request to Youtube API
// Ik it's written in a sketchy way LOL so
// TODO: refactor this function, it's ugly
function sendReq(query, message, serverQueue, func = undefined, argvs = undefined) {
    console.log("fetching results");
    fetch(url + query)
        .then(data=>{ return data.json();})
        .then(res=>{ if(isDebug) console.log(res);
            if(func) {
                if(argvs) // if we have arguments we want to pass to callback
                    func(res, message, serverQueue, argvs);
                else // specific callback specified
                    func(res, message, serverQueue)
            } else { //default to enqueue
                enqueue(res, message, serverQueue);
            }
        });
};

// for caching
const fs = require('fs');

const queue = new Map();
const BalPriorityQueue = require('./balanced-priority-queue.js');
let bpq;

// for saving and loading cache
// gdi windows why are you like this
if(process.platform === "win32") {
    const rl = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // when we recieve the terminating signal, END IT ALL. peacefully.
    rl.on("SIGINT", function() {
        botState = states.EXITING;
        process.emit("SIGINT");
    });
}

// redundant botstate change in case
// when sigint recieved, save the cache
process.on("SIGINT", function() {
    botState = states.EXITING;
    saveCache(BPQ_PATH);
    process.exit();
});

function saveCache(BPQ_PATH) {
    // stringify the cache
    const cache = JSON.stringify({
        pq: bpq.getCacheForSave()
    });

    fs.writeFileSync(BPQ_PATH, cache);

    process.exit();
};

function loadCache(BPQ_PATH) {
    let data = undefined;
    if(fs.existsSync(BPQ_PATH))
        data = JSON.parse(fs.readFileSync(BPQ_PATH));
    // you can pass null / undef FYI
    bpq  = new BalPriorityQueue(data, isDebug);
};

const states = {
    DC: 0,
    CONNECTED: 1,
    PLAYING: 2,
    PAUSED: 3,
    EXITING: 4,
};

let dispatcher = undefined;
let currentSong = undefined;
let recentRequestPerUser = {};

// this is where we link commands from input to the functions
let botFuncs = {};
botFuncs[`${prefix}h`] = botFuncs[`${prefix}help`] = help;
botFuncs[`${prefix}play`] = execute;
botFuncs[`${prefix}p`] = togglePlay;
botFuncs[`${prefix}stop`] = botFuncs[`${prefix}pause`] = pause;
botFuncs[`${prefix}skip`] = botFuncs[`${prefix}s`] = skip;
botFuncs[`${prefix}resume`] = botFuncs[`${prefix}r`] = resume;
botFuncs[`${prefix}oops`] = botFuncs[`${prefix}o`] = wrongResult;
botFuncs[`${prefix}UwUops`] = wongWesults;
botFuncs[`${prefix}queue`] = botFuncs[`${prefix}q`] = listQueue;
botFuncs[`${prefix}remove`] = botFuncs[`${prefix}rm`] = removeFromQueue;
botFuncs[`${prefix}clear`] = botFuncs[`${prefix}clr`] = botFuncs[`${prefix}l`] = clearQueue;

// start at dc'd
let botState = states.DC;

loadCache(BPQ_PATH);

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

    // ignore messages from other bots
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

    // stop taking commands after exit signal recieved as it may fuck up the cache
    if(botState === states.EXITING) {
        return message.channel.send('Veda is currently shutting down and cannot take any commands.');
    }

    // check if the commands are valid
    if(Object.keys(botFuncs).indexOf(message.content.split(" ")[0]) === -1) {
        console.log('Error: Unrecognized command: ', message.content.split(" ")[0]);
        return message.channel.send('Unrecognized command: ' + message.content.split(" ")[0]);
    }

    // if help is requested, don't need to be in a voice channel
    // TODO: fix it so it doesn't check for just 2 commands
    if(message.content === `${prefix}h` || message.content === `${prefix}help`) {
        return help(message, undefined);
    }

    // can't send music bot commands without being in a voice channel
    if(!message.member.voice.channel) {
        if(isDebug) console.log(message.member.voice.channel);
        return message.channel.send('You must be in a voice channel to send a music related command to Veda.');
    }

    console.log("Log: command: " + message.content.split(" ")[0]);

    const serverQueue = queue.get(message.guild.id);
    // call the relevant function for the command
    botFuncs[message.content.split(" ")[0]](message, serverQueue);
});

// this is run when they queue a song to play
// sorry for the confusing name
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

    let res;

    // check if it's just a url
    if(validURL(args[1])) {
        // url, no need to fetch
        if(isDebug) {
            console.log('DEBUG: Given a URL:', args[1]);
        }

        if(!args[1].includes('youtube')) {
            if(isDebug) console.log('Non-youtube link');

            return message.channel.send('Only non-shortened Youtube links are accepted');
        }

        // pass to enqueue
        // need vID?
        let url = args[1];
        let vidSub = url.split('v=')[1];
        let ampPos = vidSub.indexOf('&');
        let vID = ampPos !== -1 ? vidSub.substring(0, amPos) : vidSub;
        let song = {
            id: { videoId: vID }
        };

        res = bpq.getWithVID(vID);
        if(res) {
            res.isCached = true;
            res = {items: [res] };
        }
        else
            res = {items: [song]};

        enqueue(res, message, serverQueue);
        return;
    }

    // get cached if possible
    // remove the command part of the string as it will lower score unecessarily
    res = await bpq.get(message.content.substring(message.content.indexOf(' ') + 1));
    if(res) {
        if(isDebug) {
            console.log('DEBUG: cache match found.');
            message.channel.send('DEBUG: cache match found');
        }
        res.isCached = true;
        enqueue({items: [res]}, message, serverQueue);
        return;
    }
    
    // not cached, have to fetch from youtube.
    if(isDebug) console.log('DEBUG: cannot find cache match.');
    sendReq(args.slice(1, args.length + 1).join('+'), message, serverQueue);

};

// actual enqueuing the song
async function enqueue(response, message, serverQueue) {
    if(isDebug) console.log('DEBUG Status: Enqueue.');

    // this is from the youtube API call
    let results = response.items;
    if(isDebug) console.log('DEBUG: Results in enqueue ', results);
    if(!results || results.length === 0) {
        return message.channel.send('No matching query found.');
    }

    // get and build song properties
    let song;
    if(results[0].isCached) { // cached: we can just build the song obj
        song = results[0];
        song.requester = message.author.toString();
        song.wrongCount = 0;
        song.message = message.content;
    } else { // not cached: just get it from ytdl
        const vID = results[0].id.videoId;
        song = await getSong(message, vID, 0);
    }

    if(isDebug) {
        console.log('DEBUG: song obj in enqueue:', song);
    }

    // add to / update cache
    bpq.addSong(song);
    // keep track of each user's last requested song for the oops command
    recentRequestPerUser[song.requester] = {
        results: results,
        wrongCount: 0,
        song: song
    };

    if(isDebug) console.log('DEBUG Log: Server queue check');

    if(!serverQueue) { // create a server queue if we don't have one
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

// actually playing the song
function play(guild, song) {
    console.log('Status: Playing audio');

    // last song they requested, no longer need to keep track
    if(song && recentRequestPerUser[song.requester].results[song.wrongCount].id.videoId
        === song.vID) {
        delete recentRequestPerUser[song.requester];
    }

    currentSong = song;

    const serverQueue = queue.get(guild.id);

    // TODO: timeout to leave channel
    if(!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }

    if(isDebug) console.log('DEBUG: song url ', song.url);
    dispatcher = serverQueue.connection
        .play(ytdl(song.url, { filter: 'audioonly', quality: 'highestaudio', highWaterMark: 1 << 25 }))
        .on("finish", () => { // when song is finished
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

function listQueue(message, serverQueue) {
    let ret = 'Current queue:\n';

    for(let i in serverQueue.songs) {
        ret += `${i}. ${serverQueue.songs[i].title}\n`;
    }

    ret += `
use \`${prefix}remove NUMBER\` to remove NUMBERth item from queue.
    `;
    return message.channel.send(ret);
};

function removeFromQueue(message, serverQueue) {
    let num = message.content.split(" ")[1];

    if(isNaN(num) || parseInt(num) >= serverQueue.songs.length) {
        return message.channel.send('Invalid selection ' + num);
    }

    num = parseInt(num);
    let title = serverQueue.songs[num].title;
    let numth = num === 1 ? 'st' : (num === 2 ? 'nd' : (num === 3 ? 'rd' : 'th'));
    serverQueue.songs.splice(num, 1);

    return message.channel.send(`Removed ${num}${numth} entry: ${title} in the queue.`);
};

function clearQueue(message, serverQueue) {
    serverQueue.songs = [];
    return message.channel.send(`${message.author.toString()} cleared the queue.`);
};

// function for oops command
async function wrongResult(message, serverQueue) {
    // user can only fix their own last queued song that hasn't been played yet
    let songInfo = recentRequestPerUser[message.author.toString()];
    if(!songInfo) {
        return message.channel.send('No song queued.');
    }

    // wrongCount lets us know which result to take next.
    let wrongCount = 0;
    let vID = undefined;
    let song = songInfo.song;

    if(!song.isCached) { // not cached, change as normal
        // loops back if the last song still isn't what they want; just in case
        // if they'd rather have the first one.
        wrongCount = songInfo.wrongCount + 1 === songInfo.results.length ?
            0 : songInfo.wrongCount + 1;
        songInfo.wrongCount = wrongCount;
        vID = songInfo.results[wrongCount].id.videoId;
        getAndSwapSong(undefined, message, serverQueue, {
            song: song,
            vID: vID,
            wrongCount: wrongCount
        });
    } else { // cached, fetch new results befroe swapping
        let args = song.message.split(" ");
        args = args.slice(1, args.length + 1).join('+');
        sendReq(args, message, serverQueue, getAndSwapSong, {song: song, wrongCount: wrongCount});
    }
};

async function getAndSwapSong(res, message, serverQueue, argvs) {
    const song = argvs.song;
    const wrongCount = argvs.wrongCount;
    let vID = argvs.vID;

    if(res) { // only exists if we had to refetch
        const results = res.items;

        if(!results || results.length === 0) {
            return message.channel.send('Unable to retrieve alternative query result.');
        }
    
        vID = results[0].id.videoId;
    }

    if(isDebug) {
        console.log('DEBUG W: song info ', song);
        console.log('DEBUG W: wrongCount ', wrongCount);
        console.log('DEBUG W: song id ', vID);
    }

    const newSong = await getSong(message, vID, wrongCount);

    if(res) {
        recentRequestPerUser[song.requester] = {
            results: res.items,
            wrongCount: wrongCount,
            song: newSong
        };
    }

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
    // get index of the song we need to replace
    const index = serverQueue.songs.map(function(e) { return song.vID; })
    .indexOf(song.vID);
    if(isDebug) {
        console.log('DEBUG replace: replacing song');
        console.log('DEBUG replace: to replace index: ', index)
        console.log('DEBUG replace: old song: ', serverQueue[index]);
    }
    // replace it
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

// courtesy of
// https://stackoverflow.com/questions/5717093/check-if-a-javascript-string-is-a-url
function validURL(str) {
    var pattern = new RegExp('^(https?:\\/\\/)?'+ // protocol
      '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|'+ // domain name
      '((\\d{1,3}\\.){3}\\d{1,3}))'+ // OR ip (v4) address
      '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*'+ // port and path
      '(\\?[;&a-z\\d%_.~+=-]*)?'+ // query string
      '(\\#[-a-z\\d_]*)?$','i'); // fragment locator
    return !!pattern.test(str);
};

// help
function help (message, serverQueue) {
    const helpMsg =
`Hello! I am Veda. These are my current functionalities:
    - Play music.

My command prefix is \`${prefix}\`.

Documentation notes:
    - [...] denotes optional arguments.
    - Capitalization denotes required arguments.
    - \`...\` denotes a command.

These are the available commands:
    - play NAME     search Youtube for NAME and play the top result.
    - play URL      go to Youtube URL and play that video.
    - resume        resumes playback.
    - skip          skip current song.
    - queue         display songs in the queue.
    - remove NUM    remove NUMth song on the queue.
    - clear         clears the entire queue - careful, you'll get called out.
    - oops          search for the next best result for **your** last query if songbot queues the wrong song. Only works before it's played.
    - help          shows this help message.

Shorthands (If you get confused, use above full commands):
    - p NAME        same as \`play NAME\`.
    - p URL         same as \`play URL\`.
    - p             toggles music playback.
    - r             same as \`resume\`.
    - s             same as \`skip\`.
    - q             same as \`queue\`.
    - rm            same as \`remove\`.
    - clr           same as \`clear\`.
    - o             same as \`wrong\`.
    - h             same as \`help\`.
`;

    return message.channel.send(helpMsg);
};
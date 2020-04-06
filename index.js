const Discord = require('discord.js');
const {
    prefix,
    token
} = require('./config.json');
const ytdl = require('ytdl-core');

const client = new Discord.Client();
client.login(token);

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

client.once('ready', () => { console.log('Ready'); });

client.once('reconnecting', () => { console.log('Reconnecting...'); });

client.once('disconnect', () => { console.log('Disconnected'); });

client.on('message', async message => {

    console.log('Message: ' + message.content);
    console.log("First argument: " + message.content.split(" ")[0] + " ," + message.content.split(" ")[0].length);
    console.log(`${prefix}play`);

    if(message.author.bot) return;

    if(!message.content.startsWith(prefix)) return;

    const serverQueue = queue.get(message.guild.id);

    if(message.content.split(" ")[0][0] !== `${prefix}` || Object.keys(botFuncs).indexOf(message.content.split(" ")[0]) === -1) {
        console.log('invalid command received: ', message.content.split(" ")[0]);
        return;
    }

    if(!message.member.voiceChannel) {
        return message.channel.send('You must be in a voice channel to send a Skynet command.');
    }

    console.log("First argument: " + message.content.split(" ")[0]);

    botFuncs[message.content.split(" ")[0]](message, serverQueue);
});

async function execute(message, serverQueue) {
    const args = message.content.split(" ");

    let vc = message.member.voice.channel;
    if(!vc) {
        // join channel here
    }

    vc = message.member.voice.channel;

    const permissions = vc.permissionsFor(message.client.user);

    if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
        return message.channel.send(
          "I need the permissions to join and speak in your voice channel!"
        );
    }

    const songInfo = await ytdl.getInfo(args.slice(1, args.length + 1).join(' '));
    const song = {
        title: songInfo.title,
        url: songInfo.video_url
    }

    if(!serverQueue) {
        const queueContruct = {
            textChannel: message.channel,
            voiceChannel: vc,
            connection: null,
            songs: [],
            volume: 5,
            playing: true
        };
    
        queue.set(message.guild.id, queueContruct);
    
        queueContruct.songs.push(song);
    
        try {
            var connection = await mesage.member.voiceChannel.join();
            queueContruct.connection = connection;
            play(message.guild, queueContruct.songs[0]);
        } catch (err) {
            console.log(err);
            queue.delete(message.guild.id);
            return message.channel.send(err);
        }
    } else {
        serverQueue.songs.push(song);
        console.log(serverQueue.songs);
        return message.channel.send(`${song.title} has been added to the queue.`);
    }
};

function play(guild, song) {
    const serverQueue = queue.get(guild.id);
    if(!song) {
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }

    const dispatcher = serverQueue.connection
        .play(ytdl(song.url))
        .on("finish", () => {
        serverQueue.songs.shift();
        play(guild, serverQueue.songs[0]);
        })
        .on("error", error => console.error(error));
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
    serverQueue.textChannel.send(`Now playing: ${song.title} by ${song.author}`);
};

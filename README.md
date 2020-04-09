# DiscordMusicBot
A Discord Music bot so that I don't have to compete bandwidth with others.

v1.1

Written by Albion Fung

Current Features:
- Play from name or URL on Youtube
- Pause, skip, resume
- Fix incorrectly queued songs from the bot by going through other query results
- Shorthand commands for all commands

Upcoming Features:
Please see issues board.

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
- do not directly charge customers for using an application that uses this code base *
- have this same clause for the distribution and integration of your code

*: The code may still be used in a commercial operation as long as it is offered free.
   For example, you may make use of this code in an operation that makes a profit off of
   advertisements, as long as you do not charge users to pay for this code's functionality
   - including the functionality of this code "free" to certain tiers of purchase but not
   others is considered charging the user directly.
   
   Note: highWaterMark in ytdl's call gives it 32MB of buffer. If that's too much, please change it
   manually for your use case.

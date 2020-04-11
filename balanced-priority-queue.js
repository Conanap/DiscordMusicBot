/*
Balanced Priority Queue

Written by Albion Fung

This is a priority queue based on number of playbacks (pCount).
Every Time addSong is called, the corresponding song's count is
incremented 1. When all 100 cache slots fill up, we reduce pCount
proportionally based on the last time the song was played; the
longer ago it was played, the more the count is decreased. We then
remove the 30 least count elements and a new slot opens up.

The weights should be played with to acheive the accuracy you desire.

Requires fuzzyset.js: https://glench.github.io/fuzzyset.js/
*/

const fuzzySet = require('fuzzyset.js');

class BalancedPriorityQueue {

    constructor(cache, debug) {
        this.pq = [];
        this.DAY = 86400000;
        this.debug = debug;

        if(cache) {
            this.pq = cache.pq;
        }
    };

    addSong(song) {
        let currTime = Date.now();
        let index = this.pq.findIndex(x => x.vID === song.vID);

        if(this.debug) console.log('BPQ DEBUG: index ', index);
        if(index !== -1) {
            this.pq[index].pCount += 1;
            this.pq[index].lastPlayed = currTime + this.DAY;
            this.pq[index].message = song.message;

            if(this.debug) console.log('BPQ DEBUG: pq @index', this.pq[index]);
            this.reshuffle();
            return;
        }

        let temp = {
            vID: song.vID,
            id: {
                videoId: song.vID
            },
            title: song.title,
            pCount: 1,
            lastPlayed: currTime + this.DAY, // 1 day buffer
            url: song.url
        };

        if(this.pq.length >= 100) {
            this.recalculate(currTime);
            this.reshuffle();
            // remove last 30 elements
            this.pq.splice(70);
        }

        // new meat, always least # plays
        this.pq.push(temp);
    };

    recalculate(currTime) {
        // for ea cached song
        // remove count based on time passed
        for(let i = 0; i < this.pq.length; i++) {
            pq[i].pCount = Math.floor(pq[i].pCount * this.formula(this.pq[i].lastPlayed, currTime));
        }
    };

    formula(songTime, currTime) {
        // we need to lose inverse to how recent it is played
        let time = 1;
        time -= songTime / currTime;
        
        return time;
    };

    reshuffle() {
        // ie resort it into a proper priority queue
        this.pq.sort((a, b) => b.pCount - a.pCount);
    };

    get(title) { // given title, we find the closest match
        // TODO: return highest # instead of first
        let index = this.pq.findIndex(x => this.isMatch(title, x.title));
        if(this.debug) {
            console.log('BPQ DEBUG: cache index ', index);
            console.log('BPQ DEBUG: cache ', this.pq[index]);
        }
        return this.pq[index];
    };

    getWithVID(vID) {
        let index = this.pq.findIndex(x => x.id.videoId === vID);
        if(this.debug) {
            console.log('BPQ DEBUG getWithVID: vID index ', index);
            console.log('BPQ DEBUG getWithVID: vID cache ', this.pq[index]);
        }
        return this.pq[index];
    };

    update(vID, fieldName, fieldVal) {
        let index = this.pq.findIndex(x => x.id.videoId === vID);
        if(this.debug) {
            console.log('BPQ DEBUG update: vid', vID);
            console.log('BPQ DEBUG update: vID index', index);
            console.log('BPQ DEBUG update: vID cache', this.pq[index]);
        }

        if(index === -1)
            return false;
        
        this.pq[index][fieldName] = fieldVal;

        if(this.debug) {
            console.log('BPQ DEBUG: updated obj', this.pq[index]);
        }

        return true;
    };

    isMatch(request, testing) {
        request = request.toUpperCase();
        testing = testing.toUpperCase();

        let reqObj = {};
        let testObj = {};

        // removing stuff in brackets, hopefully just one
        if(testing.indexOf('(') !== -1) {
            testing = testing.replace(
                testing.substring(testing.indexOf('('),
                                    testing.indexOf(')') + 1),
                "");
        }

        if(request.indexOf('(') !== -1) {
            request = request.replace(
                request.substring(request.indexOf('('),
                                    request.indexOf(')') + 1),
                "");
        }

        // split at -
        // noticed that before was always artist, after was
        // always title
        if(testing.indexOf('-') !== -1) {
            testObj.title = testing.split('-')[1];
            testObj.artist = testing.split('-')[0];
        } else if (testing.indexOf('BY') !== -1) {
            testObj.title = testing.split('BY')[0];
            testObj.artist = testing.split('BY')[1];
        } else {
            // GOOD LUCK LMFAO
            testObj.sole = testing;
        }

        if(request.indexOf('-') !== -1) {
            reqObj.title = request.split('-')[1];
            reqObj.artist = request.split('-')[0];
        } else if (testing.indexOf('BY') !== -1) {
            reqObj.title = testing.split('BY')[0];
            reqObj.artist = testing.split('BY')[1];
        } else {
            reqObj.sole = request;
        }

        // match to best of our ability
        return this.fuzzyStringMatch(reqObj, testObj);
    };

    fuzzyStringMatch(reqObj, testObj) {
        let sole1 = undefined;
        let sole2 = undefined;
        let ot = undefined;
        let ret = undefined;
        let ts = undefined;
        let ass = undefined;

        if(reqObj.sole) {
            sole1 = reqObj.sole;
            ot = testObj;
        }

        if(testObj.sole) {
            sole2 = testObj.sole;
            ot = reqObj;
        }

        if(this.debug) {
            console.log('BPQ DEBUG: sole1 ', sole1);
            console.log('BPQ DEBUG: sole2', sole2);
            console.log('BPQ DEBUG: ot ', ot);
            console.log('BPQ DEBUG: reqObj ', reqObj);
            console.log('BPQ DEBUG: testObj ', testObj);
            console.log('BPQ DEBUG: ');
        }

        // both strings couldn't be split; best of luck!
        if(sole1 && sole2) {
            ret = fuzzySet([sole1], false).get(sole2);
            if(ret)
                ret = ret[0][0] > 0.6;
            else
                ret = false;

            if(this.debug) console.log('BPQ DEBUG: ret ', ret);
            return ret;
        }
        if(sole2) { // if we have sole 2, then sole 1 dne. can move it over.
            sole1 = sole2;
            sole2 = undefined;
        }
        if(sole1) { // sole1 is the longer string, it's the sole input from that side.
            let fset = fuzzySet([sole1], false);

            if(this.debug) {
                console.log('BPQ DEBUG: sole1 ', sole1);
                console.log('BPQ DEBUG: sole1 title ', ot.title);
                console.log('BPQ DEBUG: sole1 title fset get ', fset.get(ot.title));
                console.log('BPQ DEBUG: sole1 artist ', ot.artist);
                console.log('BPQ DEBUG: sole1 artist fset get ', fset.get(ot.artist));
            }

            ts = fset.get(ot.title);
            if(ts)
                ts = ts[0][0];

            ass = fset.get(ot.artist);
            if(ass)
                ass = ass[0][0];

            if(this.debug) {
                console.log('BPQ DEBUG: weighted ts ', ts ? ts > ( 0.6 * ot.title.length / sole1.length ) : ts);
                console.log('BPQ DEBUG: weighted ass ', ass ? ass > ( 0.6 * ot.title.length / sole1.length ) : ass);
            }

            // weight need to account for str len (eg if short title, it might not match)
            // weight * (title / sole string length) because we want it to increase score if
            // title is short (shorter title = smaller score)
            ret = ts > ( 0.6 * ot.title.length / sole1.length ) && (!ass || ass > ( 0.6 * ot.title.length / sole1.length ));
            if(this.debug) console.log('BPQ DEBUG: ret ', ret);
            return ret;
        }

        let titleSet = fuzzySet([testObj.title], false);
        let artistSet = fuzzySet([testObj.artist], false);

        ts = titleSet.get(reqObj.title);
        if(ts)
            ts = ts[0][0] > 0.8;

        ass = artistSet.get(reqObj.artist);
        if(ass)
            ass = ass[0][0] > 0.30;

        ret = ts && ass;
        if(this.debug) console.log('BPQ DEBUG: ret ', ret);
        return ret;
    };

    getCacheForSave() {
        return this.pq;
    };
};

module.exports = BalancedPriorityQueue;
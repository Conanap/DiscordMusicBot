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

    constructor(debug) {
        this.pq = [];
        this.DAY = 86400000;
        this.debug = debug;
    };

    addSong(song) {
        let currTime = Date.now();
        let index = this.pq.findIndex(x => x.vID === song.vID);

        if(this.debug) console.log('BPQ DEBUG: index ', index);
        if(index !== -1) {
            this.pq[index].pCount += 1;
            this.pq[index].lastPlayed = currTime + this.DAY;
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
        this.pq.sort((a, b) => b.pCount - a.pCount);
    };

    get(title) {
        let index = this.pq.findIndex(x => this.isMatch(title, x.title));
        if(this.debug) {
            console.log('BPQ DEBUG: cache index ', index);
            console.log('BPQ DEBUG: cache ', this.pq[index]);
        }
        return this.pq[index];
    };

    isMatch(request, testing) {
        request = request.toUpperCase();
        testing = testing.toUpperCase();

        let reqObj = {};
        let testObj = {};

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

        if(sole1 && sole2) {
            ret = fuzzySet([sole1]).get(sole2);
            if(ret)
                ret = ret[0][0] > 0.7;
            else
                ret = false;

            if(this.debug) console.log('BPQ DEBUG: ret ', ret);
            return ret;
        }
        if(sole2) {
            sole1 = sole2;
            sole2 = undefined;
        }
        if(sole1) {
            let fset = fuzzySet([sole1]);

            if(this.debug) {
                console.log('BPQ DEBUG: sole1 title ', ot.title);
                console.log('BPQ DEBUG: sole1 fset get ', fset.get(ot.title));
                console.log('BPQ DEBUG: sole1 artist ', ot.artist);
                console.log('BPQ DEBUG: sole1 fset get ', fset.get(ot.artist));
            }

            ts = fset.get(ot.title);
            if(ts)
                ts = ts[0][0];

            ass = fset.get(ot.artist)
            if(ass)
                ass = ass[0][0];

            ret = ts > 0.5 && (!ass || ass > 0.5);
            if(this.debug) console.log('BPQ DEBUG: ret ', ret);
            return ret;
        }

        let titleSet = fuzzySet([testObj.title]);
        let artistSet = fuzzySet([testObj.artist]);

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
};

module.exports = BalancedPriorityQueue;
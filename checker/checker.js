class Check {
    constructor(check) {
        this.infos = check; // save this raw check parameter anyway
        this.name = check.name;
        this.type = check.type;
        if (check.async) {
            this.async = true;
            this._check = check.check;
        } else {
            this.async = false;
            this._check = function(checkable) {
                if (check.check(checkable)) {
                    return Promise.resolve();
                } else {
                    console.log('checking: ' + this.name + ' failed');
                    return Promise.reject();
                }
            };
        }
    }
    check(checkable) { // just in order to print log, may delete in future
        console.log('checking: ' + this.name);
        return this._check(checkable);
    }
}
Check.builder = function() {
    class CheckBuilder {
        #check = {};
        name(name) {this.#check.name = name; return this;}
        type(type) {this.#check.type = type; return this;}
        check(check) {this.#check.check = check; return this;}
        doCheckOn(doCheckOn) {this.#check.doCheckOn = doCheckOn; return this;}
        isAsync() {this.#check.async = true; return this;}
        build() {return new Check(this.#check);}
    }
    return new CheckBuilder();
};

class Checkable {
    rules = new Map();
    constructor(data) {
        this.data = data;
        this.addStatus(true, 'inAllCondition');
    }
    addStatus(check, name) {
        this.rules.set(name, []);
        if (check instanceof Check) {
            Object.defineProperty( this, name, { get : function() {return check.check(this);} } );
        } else if (typeof check == 'function') {
            Object.defineProperty( this, name, { get : function() {return check(this);} } );
        } else if (typeof check == 'boolean') {
            Object.defineProperty( this, name, { get : function() {return check;} } );
        }
    }
    #addCheck(check, name) {
        this.rules.get(name).push(check);
    }
    addCheck(check) {
        this.#addCheck(check, check.name);
    }
    addChecks(checks) {
        // in the older version, this function adds status and check at same time,
        // but now a Check object returns a Promise, so status added here won't work.
        // I'll keep it for now.
        for (const check of checks) {
            if (check.type == 'status') {
                this.addStatus(check, check.name);
            }
        }
        for (const check of checks) {
            if (check.type == 'check') {
                if (Array.isArray(check.infos.doCheckOn)) {
                    for (const condition of check.infos.doCheckOn) {
                        this.#addCheck(check, condition);
                    }
                } else if (typeof check.infos.doCheckOn == 'string') {
                    this.#addCheck(check, check.infos.doCheckOn);
                } else {
                    this.#addCheck(check, 'inAllCondition');
                }
            }
        }
    }
    docheck(status) {
        if (!status) {
            status = [];
            this.rules.forEach((_v, k) => status.push(k));
        } else if (!Array.isArray(status)) {
            status = [status];
        }

        let promises = [];
        for (const s of status) {
            let result = this[s];
            if (typeof result == 'boolean' && result) {
                let statusPromises = [];
                for (const check of this.rules.get(s)) {
                    statusPromises.push(check.check(this));
                }
                promises.push(Promise.all(statusPromises));
            } else if (result instanceof Promise) {
                promises.push(result.then(() => {
                    let statusPromises = [];
                    for (const check of this.rules.get(s)) {
                        statusPromises.push(check.check(this));
                    }
                    return Promise.all(statusPromises)
                }, () => {
                    return Promise.resolve();
                }));
            }
        }
        return Promise.all(promises);
    }
}

// Here's a example:

let someobject = new Checkable({sex: 1, age: 18, sexName: 'Male'});
someobject.addChecks([
    Check.builder().name('isMale').type('status').check(c => (c.data.sex == 1)).build(),
    Check.builder().name('isFemale').type('status').check(c => (c.data.sex == 2)).build(),
    Check.builder().name('isMaleAsync').type('status').check(
            c => new Promise((resolve, reject) => {
                setTimeout(() => {if (c.data.sex == 1) {resolve();} else {reject();}}, 2000) 
            })
        ).isAsync().build(),
    Check.builder().name('adult check 1').type('check').check(c => (c.data.age >= 18)).doCheckOn(['isMale']).build(),
    Check.builder().name('adult check 2').type('check').check(c => (c.data.age >= 18)).doCheckOn('isMale').build(),
    Check.builder().name('age check 1').type('check').check(
            c => new Promise((resolve, reject) => {
                setTimeout(()=>{if (c.data.age >= 0) {resolve();} else {reject();}}, 2000)
            })
        ).isAsync().build(),
    Check.builder().name('male check 1 async').type('check').check(
            c => new Promise((resolve, reject) => {
                setTimeout(()=>{if (c.data.sexName == 'Male') {resolve();} else {reject();}}, 2000)
            })
        ).doCheckOn('isMaleAsync').isAsync().build(),
]);
someobject.docheck()
.then(() => {console.log('SUCCESS')})
.catch(() => {console.log('FAIL')});

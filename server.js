//Created by Samuel Keller in Stradr

require('dotenv').config();
const methodOverride =      require('method-override');
const bcrypt =              require('bcrypt');
const passport =            require('passport');
const flash =               require('express-flash');
const session =             require('express-session');
const localStrategy =       require('passport-local').Strategy;
const express =             require('express');
const moment =              require('moment-timezone');
const fs =                  require('fs');
const request =             require('request');
const crypto =              require('crypto');
const sgMail =              require('@sendgrid/mail');
const CC =                  require('currency-converter-lt');


const authToken = process.env.AUTHTOKEN;
const accountSid = process.env.ACCOUNTSID;
const sendgridKey = process.env.SENDGRIDAPIKEY;
const polygonKey = process.env.POLYGONAPIKEY;
const DBURI = process.env.DBURI;


const client = require('twilio')(accountSid, authToken);
sgMail.setApiKey(sendgridKey);

const app = express();

const bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());


app.use('/img.png', express.static('static/images/favicon.ico'));
app.use('/versionNumber.html', express.static('documents/versionNumber.txt'));
app.use('/stradr340.png', express.static('static/pressKit/stradr340.png'));
app.use('/baseStyle.css', express.static('static/css/baseStyle.css'));

app.get('/error', (req, res, next) => {
    res.send('Something broke!');
    next(new Error('Custom error message'));
});

app.get('/exception', () => {
    JSON.parse('{"malformedJson": true');
});

const defaultAddStr = {
    currency: 'USD',
    darkMode: 'false',
    leaderboardSettings: 'auto'
};

const defaultPosString = [
    {
        ticker: 'GME',
        buyPrice: 41.64,
        orders: [],
        buyTime: '12-24-2023'
    },
    {
        ticker: 'SPY',
        buyPrice: 400,
        orders: ["BUYMARKETOPEN~7"],
        buyTime: '12-21-2023'
    },
    {
        ticker: 'QQQ',
        buyPrice: 284,
        orders: ["SELLMARKETOPEN~2"],
        buyTime: '12-22-2023'
    },
    {
        ticker: 'AAPL',
        buyPrice: 128,
        orders: ["BUYMARKETCLOSE~8"],
        buyTime: '12-24-2023'
    }
];

//MongoDB and mongoose
const mongoose = require('mongoose');
mongoose.set("strictQuery", false);

mongoose.connect(DBURI, {
    useNewUrlParser: true, 
    useUnifiedTopology: true
});

app.use(express.urlencoded({
    extended: false
}));


app.set('view engine', 'ejs');

app.use(function (req, res, next) {
    if (req.path.includes('/competition')) {
        app.set('views', './Competition/views');
    } else {
        app.set('views', './views'); 
    }
    next();
})

app.use(express.json());
app.use(flash());
app.use(methodOverride('_method'));


app.use(session({
    secret: crypto.randomBytes(20).toString('hex'),
    resave: false,
    saveUninitialized: false
}));


app.use(passport.initialize());
app.use(passport.session());

let msg = "";

const User = require('./Schemas/userSchema');
const Tickers = require('./Schemas/tickerSchema');
const Group = require('./Schemas/groupSchema');


app.get('/login', ensureNotLogin, (req, res) => {
    res.render('login', {
        addStr: JSON.stringify(defaultAddStr),
    });
});

app.get('/login/:redirect', ensureNotLogin, (req, res) => {
    res.render('login', {
        addStr: JSON.stringify(defaultAddStr),
    });
});

app.get('/sitemap', (req, res) => {
    if (req.user) {
        res.render('sitemap', {
            name: req.user.styledUsername,
            addStr: JSON.stringify(req.user.addStr),
            dispSub: true
        });
    } else {
        res.render('sitemap', {
            addStr: JSON.stringify(defaultAddStr),
            name: "Sign up",
            dispSub: false
        });
    }
});
app.get('/sitemap.xml', (req, res) => {
    res.setHeader('Content-Type', 'text/xml');
    res.end(fs.readFileSync('./sitemap.xml', {encoding: 'utf-8'}));
});
app.get('/register', ensureNotLogin, (req, res) => {
    res.render('register', {
        message: "",
        addStr: JSON.stringify(defaultAddStr),
    });
});
app.get('/register1', ensureNotLogin, (req, res) => {
    res.render('register1', {
        message: "",
        addStr: JSON.stringify(defaultAddStr),
    });
});
app.get('/rediRegister', ensureNotLogin, (req, res) => {
    res.render('register', {
        message: msg,
        addStr: JSON.stringify(defaultAddStr),
    });
});

//Account system

function ensureNotLogin (req, res, next) {
    if (req.isAuthenticated()) {
        return res.redirect('/accountSettings');
    }
    next();
}

passport.serializeUser(function(user, done) {
    done(null, user.id);
    
});

passport.deserializeUser(function(id, done) {
    User.findById(id, function(err, user) {
        done(err, user);
    });
});

passport.use(new localStrategy(function(username, password, done) {
    User.findOne({username: username}, function(err, user) {
        if (err) {
            return done(err);
        }
        if (!user) {
            User.findOne({ email: username }, function(err, user) {
                if (err) {
                    return done(err);
                }
                if (!user) {
                    return done(null, false, {message: "Incorrect username or password"});
                } else {
                    bcrypt.compare(password, user.password, function(err, res) {
                        if (err) {
                            return done(err);
                        }
                        if (res == false) {
                            return done(null, false, {message: "Incorrect username or password"});
                        }
                        console.log("Logged in with email");
                        return done(null, user);
                    });
                }
            });
        } else {
            bcrypt.compare(password, user.password, function(err, res) {
                if (err) {
                    return done(err);
                }
                if (res == false) {
                    return done(null, false, {message: "Incorrect username or password"});
                }
                console.log("Logged in with username");
                return done(null, user);
            });
        }
    });
}));

app.post('/search', (req, res) => {
    const value = req.body.searchBox;
    let tempValue = value.trim().toLowerCase();
    if (req.user) {
        res.redirect('/stock/' + tempValue + "/" + req.user.styledUsername);
    } else {
        res.redirect('/stock/' + tempValue + "/" + "Sign up");
    }
});

const validateEmail = (email) => {
    return String(email)
      .toLowerCase()
      .match(
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
      );
};

function getFormattedDate () {
    let date = new Date();
    let year = date.getFullYear();
    let month = (1 + date.getMonth()).toString().padStart(2, '0');
    let day = date.getDate().toString().padStart(2, '0');

    return month + '/' + day + '/' + year;
}

app.post('/register', ensureNotLogin, async (req, res) => {

    const eduActChk = !!req.body.educationAccount;
    
    const usernameExists = await User.exists({username: req.body.username.toLowerCase()});
    const emailExists = await User.exists({email: req.body.email.toLowerCase()});
    
    if (req.body.username.length > 14) {
        msg = "Username too long";
        res.redirect('/rediRegister');
        return;
    }
    if (usernameExists || emailExists) {
        msg = "User already exists";
        res.redirect('/rediRegister');
        return;
    }
    
    if (!validateEmail(req.body.email.toLowerCase())) {
        msg = "Email invalid";
        res.redirect('/rediRegister');
        return;
    }

    try {
        
        const hps = await bcrypt.hash(req.body.password, 10);
        
        const crypt = crypto.randomBytes(32).toString('hex');

        const user = new User({
            buyingPower: req.body.accountValueSlider,
            lastValue: req.body.accountValueSlider,
            emailVerified: crypt,
            registerTime: getFormattedDate(),
            lastLogin: "NONE",
            email: req.body.email.toLowerCase(),
            styledUsername: req.body.username.trim(),
            username: req.body.username.trim().toLowerCase(),
            valueHistory: "|" + req.body.accountValueSlider + "!" + getFormattedDate(),
            eduAct: eduActChk,
            bio: "User has no description.", 
            USDvalue: req.body.accountValueSlider,
            posString: [],
            followedStocks: " ",
            addStr: {
                darkMode: "false",
                profileSettings: "public",
                leaderboardSettings: "auto",
                currency: req.body.currency,
                groups: []
            },
            profilePic: " ", //To be implemented later
            password: hps
        });
     
        user.save();
        
        //Log the user in automatically after account creation
        req.login(user, function(err) {
            if (err) {
                console.log("ERROR: " + err);
            } else {
                req.login(user, function(err) {
                    if (!err) {
                        console.log("Registered new user!");
                        res.redirect('/tutorial');
                    } else {
                        console.log("ERROR registering and logging in new user: " + err);
                    }
                });
            }
        });

        sendVerificationMail(req.body.email.toLowerCase(), crypt);

    } catch (err) {
        console.log("ERROR creating account: " + err);
        msg = "Error creating account, try again?";
        res.redirect('/rediRegister');
    }
});

function sendVerificationMail (to, hash) {
    let msg;
    const verifyEmail = fs.readFileSync('static/emails/verifyEmail.txt', 'utf8');
    let send = verifyEmail.split('https://stradr.com/email/verify/')[0] + 'https://stradr.com/email/verify/' + hash + verifyEmail.split('https://stradr.com/email/verify/')[1];
    msg = {
        to: to,
        from: "stradr@stradr.com", 
        subject: "Stradr - Verify your email",
        html: send
    }

    sgMail
    .send(msg)
    .then(() => {
        console.log('Verification email sent');
    })
    .catch((error) => {
        console.error("ERROR: " + error);
    })
}

function usernameToLowerCase(req, res, next){
    req.body.username = req.body.username.toLowerCase();
    next();
}

function ensureLogin (req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/onboarding');
}

app.post('/login', usernameToLowerCase, ensureNotLogin, passport.authenticate('local', {
    successRedirect: '/',
    failureRedirect: '/login',
    failureFlash: true
}));

app.delete('/logout', ensureLogin, (req, res) => {
    console.log("Logging out " + req.user.styledUsername);
    req.logout(function(err) {
        if (err) { 
            return next(err); 
        }
        res.redirect('/login');
    });
});


function ensureEmailVerified (req, res, next) {
    if (req.user) {
        if (req.user.emailVerified == "true") {
            return next();
        }
    }
    res.redirect('/verifyEmail');
}

function ensureEmailNotVerified (req, res, next) {
    if (req.user.emailVerified != "true") {
        return next();
    }
    res.redirect('/tutorial');
}


function ensureNotLogin (req, res, next) {
    if (req.isAuthenticated()) {
        return res.redirect('/accountSettings');
    }
    next();
}



//End of account system

app.post('/deleteUser', ensureLogin, async (req, res) => {
    console.log("Deleting " + req.user.styledUsername + "'s account");
    let idTemp = req.user.id;
    req.logout(function(err) {
        if (err) { 
            return next(err); 
        }
    });
    User.deleteOne({ _id : idTemp }).then(function(){
        console.log("User " + idTemp + " deleted.");
        res.redirect('/register');
    }).catch(function(err){
        console.log("Error deleting user: " + err);
        req.session.message = "Error deleting user, try again?";
        req.session.error = err;
        req.session.redirect = '/accountSettings';
        res.redirect('/genError');
    });
});

const developmentPositions = false;
app.get('/positions', ensureLogin, async (req, res) => {
    let grand;
    if (!developmentPositions) {
        if (req.user.addStr.currency != "USD") {
            const currency = req.user.addStr.currency;
            grand = await get100(currency);
            res.render('positions', {
                name: req.user.styledUsername,
                buyingPower: await doConversion(currency, req.user.buyingPower),
                posString: JSON.stringify(req.user.posString),
                USDvalue: await doConversion(currency, req.user.USDvalue),
                addStr: JSON.stringify(req.user.addStr),
                grand: grand,
                priceArr: await convertPriceArr(currency, await generatePriceArr(req.user.posString))
            });
        } else {
            res.render('positions', {
                name: req.user.styledUsername,
                buyingPower: req.user.buyingPower,
                posString: JSON.stringify(req.user.posString),
                USDvalue: req.user.USDvalue,
                addStr: JSON.stringify(req.user.addStr),
                grand: 100000,
                priceArr: await generatePriceArr(req.user.posString)
            });
        }
    } else {
        res.render('positions', {
            name: "TESTNAME",
            buyingPower: 40000,
            posString: JSON.stringify(defaultPosString),
            USDvalue: "100",
            addStr: JSON.stringify(defaultAddStr),
            grand: 100000,
            priceArr: "GME|24.63#(-3.64%),E|22.69#(-1.22%),BTC|99.11#(-0.04%)"
        });
    }
});

async function convertPriceArr (currency, priceArr) {
    let newResultArr = "";
    for (let w = 1; w < priceArr.split(';').length; w++) {
        newResultArr += ';' + priceArr.split(';')[w].split('|')[0] + '|' + parseFloat(await doConversion(currency, priceArr.split(';')[w].split('|')[1].split('#')[0])).toFixed(2) + '#' + priceArr.split(';')[w].split('#')[1];
    }
    return newResultArr;
}

app.post('/resetAccount', ensureLogin, (req, res) => {
    let formattedDate = getFormattedDate();
    User.findByIdAndUpdate(req.user.id, { 
        buyingPower: 100000,
        lastValue: 100000,
        lastLogin: "NONE",
        valueHistory: "|100000!" + formattedDate,
        bio: "User has no description.", 
        USDvalue: 100000, //All accounts start with 100 grand
        posString: [], //String of all positions
        followedStocks: " ",
        addStr: defaultAddStr,
        profilePic: " ", //To be implemented later
    }, function (err, docs) {
        if (err){
            console.log("ERROR resetting account: " + err);
            req.session.message = "Error resetting account, try again?";
            req.session.error = err;
            req.session.redirect = '/accountSettings';
            res.redirect('/genError');
        } else {
            res.redirect("/accountSettings/msg/Reset account (yikes!)");
        }
    });
});

//Assorted page links
app.get('/about', (req, res) => {
    if (req.user) {
        res.render('about', {
            name: req.user.styledUsername,
            addStr: JSON.stringify(req.user.addStr)
        });
    } else {
        res.render('about', {
            name: "Sign up",
            addStr: JSON.stringify(defaultAddStr),
        });
    }
});

app.get('/groups', ensureLogin, (req, res) => {
    res.render('groups', {
        name: req.user.styledUsername,
        addStr: JSON.stringify(req.user.addStr)
    });
});

function getFormattedDate() {
    return moment().tz("America/New_York").format('MM-DD-YYYY');
}

app.get('/account', ensureLogin, async (req, res) => {
    let currencyType = req.user.addStr.currency;
    let currencyConverter = new CC({from:"USD", to: currencyType, amount:req.user.USDvalue});
    let grand = await get100(currencyType);
    currencyConverter.convert().then((response) => {
        let convertedValue = parseFloat(response);            
        res.render('accountSettings', {
            id: req.user.id, 
            valueHistory: req.user.valueHistory,
            name: req.user.styledUsername,
            message: "",
            value: convertedValue,
            addStr: JSON.stringify(req.user.addStr),
            bio: req.user.bio,
            eduAct: req.user.eduAct,
            grand: grand
        });
    });
});

app.post('/payload', (req, res) => {
    res.send('200');
    console.log("body: %j", req.body);
});

app.get('/onboarding', (req, res) => {
    res.render('onboarding', {
        addStr: JSON.stringify(defaultAddStr),
    });
});

app.get('/contact', (req, res) => {
    if (req.user) {
        res.render('contact', {
            name: req.user.styledUsername,
            addStr: JSON.stringify(req.user.addStr)
        });
    } else {
        res.render('contact', {
            name: "Sign up",
            addStr: JSON.stringify(defaultAddStr),
        });
    }
});
app.get('/bugs', (req, res) => {
    if (req.user) {
        res.render('bugs', {
            name: req.user.styledUsername,
            addStr: JSON.stringify(req.user.addStr)
        });
    } else {
        res.render('bugs', {
            addStr: JSON.stringify(defaultAddStr),
            name: "Sign up"
        });
    }
});
app.get('/presskit', (req, res) => {
    if (req.user) {
        res.render('presskit', {
            name: req.user.styledUsername,
            dispSub: true,
            addStr: JSON.stringify(req.user.addStr)
        });
    } else {
        res.render('presskit', {
            name: "Sign up",
            dispSub: false,
            addStr: JSON.stringify(defaultAddStr),
        });
    }
});
app.get('/metrics', (req, res) => {
    if (req.user) {
        res.render('metrics', {
            name: req.user.styledUsername,
            dispSub: true,
            addStr: JSON.stringify(req.user.addStr)
        });
    } else {
        res.render('metrics', {
            name: "Sign up",
            addStr: JSON.stringify(defaultAddStr),
            dispSub: false
        });
    }
});

app.get('/accountSettings', ensureLogin, async (req, res) => {
    let currencyType = req.user.addStr.currency;
    let currencyConverter = new CC({from:"USD", to: currencyType, amount:req.user.USDvalue});
    let grand = await get100(currencyType);
    currencyConverter.convert().then((response) => {
        let convertedValue = parseFloat(response);            
        res.render('accountSettings', {
            id: req.user.id, 
            valueHistory: req.user.valueHistory,
            name: req.user.styledUsername,
            message: "",
            value: convertedValue,
            addStr: JSON.stringify(req.user.addStr),
            bio: req.user.bio,
            eduAct: req.user.eduAct,
            grand: grand
        });
    });
});

app.get('/verifyEmail', ensureLogin, ensureEmailNotVerified, (req, res) => {
    res.render('verifyEmail', {
        addStr: JSON.stringify(req.user.addStr)
    });
});

app.get('/resendEmail', ensureLogin, ensureEmailNotVerified, (req, res) => {
    const crypt = crypto.randomBytes(32).toString('hex');
    sendVerificationMail(req.user.email.toLowerCase(), crypt);
    User.findByIdAndUpdate(req.user.id, { 
        emailVerified: crypt
    }, function (err, docs) {
        if (err){
            console.log("ERROR resending verification email: " + err);
            req.session.message = "Error resending email, try again?";
            req.session.error = err;
            req.session.redirect = '/market';
            res.redirect('/genError');
        }
    });
    console.log("Resent verification email");
    res.render('verifyEmail', {
        addStr: JSON.stringify(req.user.addStr)
    });
});
``
app.get('/emailVerified', ensureLogin, (req, res) =>   {
    res.render('emailVerified', {
        addStr: JSON.stringify(req.user.addStr)
    });
});
app.get('/privacy', (req, res) => {
    if (req.user) {
        res.render('privacy', {
            name: req.user.styledUsername,
            addStr: JSON.stringify(req.user.addStr)
        });
    } else {
        res.render('privacy', {
            name: "Sign up",
            addStr: JSON.stringify(defaultAddStr),
        });
    }
});
app.get('/use', (req, res) => {
    if (req.user) {
        res.render('use', {
            name: req.user.styledUsername,
            addStr: JSON.stringify(req.user.addStr)
        });
    } else {
        res.render('use', {
            name: "Sign up",
            addStr: JSON.stringify(defaultAddStr),
        });
    }
});

app.post('/changeName', ensureLogin, async (req, res) => {
    const newName = req.body.name;
    const usernameExists = await User.exists({username: newName.toLowerCase()});
    if (!usernameExists) {
        await updateGroupInfo(req.user.username, newName);
        User.findByIdAndUpdate(req.user.id, { 
            styledUsername: newName,
            username: newName.toLowerCase(),
        }, function (err, docs) {
            if (err){
                req.session.message = "Error changing name, try again?";
                req.session.error = err;
                req.session.redirect = '/accountSettings';
                res.redirect('/genError');
            } else {;
                res.redirect('/accountSettings/msg/Updated username!');
            }
        });
    } else {
        res.redirect('/accountSettings/msg/Username already exits.');
    }
});

async function updateGroupInfo (username, newName) {
    const tempUser = await findUser(username);
    for (let i = 0; i < tempUser.addStr.groups.length; i++) {
        await updateGroupPeople(username, newName, tempUser.addStr.groups[i]); 
    }
    return;
}

async function updateGroupPeople (username, newName, groupId) {
    Group.findOne({ "id": groupId }, async function(e,group){
        if (group) {
            if (group.members.includes(username)) {
                let tempMembers = group.members;
                if (tempMembers.length > 1) {
                    tempMembers[tempMembers.indexOf(username)] = newName;
                } else {
                    tempMembers[0] = newName;
                }
                await Group.findOneAndUpdate({'id': groupId}, { 
                    members: tempMembers
                }, function (err, docs) {
                    if (err) {
                        console.log("ERROR changing username, can't update group members: " + err);
                        return;
                    } else {
                        return;
                    }
                }).clone();
            }
            if (group.information.admins.includes(username)) {
                let tempAdmins = group.information.admins;
                if (tempAdmins.length > 1) {
                    tempAdmins[tempAdmins.indexOf(username)] = newName;
                } else {
                    tempAdmins[0] = newName;
                }
                let tempInformation = group.information;
                tempInformation.admins = tempAdmins;
                await Group.findOneAndUpdate({'id': groupId}, { 
                    tempInformation: tempInformation
                }, function (err, docs) {
                    if (err) {
                        console.log("ERROR changing username, can't update group admins: " + err);
                        return;
                    } else {
                        return;
                    }
                }).clone();
            }
            if (group.information.leader == username) {
                let tempInformationLeader = group.information;
                tempInformationLeader.leader = newName;
                await Group.findOneAndUpdate({'id': groupId}, { 
                    information: tempInformationLeader
                }, function (err, docs) {
                    if (err) {
                        console.log("ERROR changing username, can't change group leader: " + err);
                        return;
                    } else {
                        return;
                    }
                }).clone();
            }
        } else {
            return;
        }
    }).clone();
}

async function findUser (username) {
    return new Promise(function (resolve, reject) {
        User.findOne({ "username": username }, async function(err,user){
            if (user && !err) {
                resolve(user);
            } else {
                console.log("Error finding user: " + err);
                resolve('Error');
            }
        });
    });
}

app.post('/changeBio', ensureLogin, async (req, res) => {
    const newBio = req.body.bioInput;
    if (newBio.trim().length <= 410) {
        User.findByIdAndUpdate(req.user.id, { 
            bio: newBio,
        }, function (err, docs) {
            if (err){
                req.session.message = "Error changing description, try again?";
                req.session.error = err;
                req.session.redirect = '/accountSettings';
                res.redirect('/genError');
            } else {;
                res.redirect('/accountSettings/msg/Updated description!');
            }
        });
    } else {
        req.session.message = "Error changing description, try again?";
        req.session.error = "NICETRY";
        req.session.redirect = '/accountSettings';
        res.redirect('/genError');
    }
});

app.post('/changeSettings', ensureLogin, async (req, res) => {
    
    let tempSettings = req.user.addStr;

    tempSettings.darkMode = req.body.darkMode;
    tempSettings.profileSettings = req.body.profileMode;
    tempSettings.leaderboardSettings = req.body.leaderboardMode;
    tempSettings.currency = req.body.currency;

    let educationSettings = (req.body.educationMode === 'true');

    let usernameExists = false;
    let emailExists = false;

    if (req.body.username.trim().toLowerCase() != req.user.username.trim()) {
        usernameExists = await User.exists({username: req.body.username.toLowerCase()});
    }
    if (req.body.email.trim().toLowerCase() != req.user.email.trim().toLowerCase()) {
        emailExists = await User.exists({email: req.body.email.toLowerCase()});
    }

    if (req.body.username.length > 14) {
        return res.redirect('/accountSettings/msg/Choose a shorter username');
    }

    if ((usernameExists || emailExists)) {
        return res.redirect('/accountSettings/msg/This username or email is already in use');
    }
    
    if (!validateEmail(req.body.email.toLowerCase())) {
        return res.redirect('/accountSettings/msg/Use a valid email');
    }

    User.findByIdAndUpdate(req.user.id, { 
        addStr: tempSettings,
        eduAct: educationSettings,
        email: req.body.email.trim().toLowerCase(),
        username: req.body.username.trim().toLowerCase(),
        styledUsername: req.body.username
    }, function (err, docs) {
        if (err){
            req.session.message = "Error changing name, try again?";
            req.session.error = err;
            req.session.redirect = '/accountSettings';
            res.redirect('/genError');
        } else {
            res.redirect('/accountSettings/msg/Updated settings!');
        }
    });
});

async function get100 (currency) {
    let convertedValue = 0;
    let currencyConverter = new CC({from:"USD", to: currency, amount:100000});
    await currencyConverter.convert().then((response) => {
        convertedValue = parseFloat(response);  
    });
    return convertedValue;
}

async function doConversion (currency, amount) {
    if (currency.toLowerCase() == 'usd') {
        return amount;
    }
    let convertedValue = 0;
    let currencyConverter = new CC({from:"USD", to: currency, amount:parseFloat(amount)});
    await currencyConverter.convert().then((response) => {
        convertedValue = parseFloat(response);  
    });
    return convertedValue;
}

app.get('/accountSettings/msg/:message', ensureLogin, async (req, res) => {
    let currencyType = req.user.addStr.currency;
    let currencyConverter = new CC({from:"USD", to: currencyType, amount:req.user.USDvalue});
    let grand = await get100(currencyType);
    currencyConverter.convert().then((response) => {
        let convertedValue = parseFloat(response);            
        res.render('accountSettings', {
            id: req.user.id, 
            valueHistory: req.user.valueHistory,
            name: req.user.styledUsername,
            message: req.params.message.charAt(0).toUpperCase() + req.params.message.slice(1),
            value: convertedValue,
            addStr: JSON.stringify(req.user.addStr),
            bio: req.user.bio,
            eduAct: req.user.eduAct,
            grand: grand
        });
    });
});

let givenParams = true;
app.get('/genError', (req, res) => {
    if (req.user) {
        if (givenParams) {
            res.render('genError', {
                message: req.session.message,
                error: req.session.error,
                redirect: req.session.redirect,
                addStr: JSON.stringify(req.user.addStr)
            })
        } else {
            res.render('genError', {
                message: "Error buying stock, try again?",
                error: "Object object",
                redirect: "#",
                addStr: JSON.stringify(defaultAddStr),
            })
        }
    } else {
        if (givenParams) {
            res.render('genError', {
                message: req.session.message,
                error: req.session.error,
                redirect: req.session.redirect,
                addStr: JSON.stringify(defaultAddStr),
            })
        } else {
            res.render('genError', {
                message: "Error buying stock, try again?",
                error: "Object object",
                redirect: "/market",
                addStr: JSON.stringify(defaultAddStr),
            })
        }
    }
})
app.get('/api', (req, res) => {
    if (req.user) {
        res.render('api', {
            name: req.user.styledUsername,
            addStr: JSON.stringify(req.user.addStr)
        });
    } else {
        res.render('api', {
            name: "Sign up",
            addStr: JSON.stringify(defaultAddStr),
        });
    }
});

app.post('/joinGroup', ensureLogin, async (req, res) => {
    await Group.findOne({ "id": req.body.code }, async function(e,group){
        try {
            let members = group.members;
            if (!members.includes(req.user.username)) {
                members.push(req.user.username);
                Group.findOneAndUpdate({'id': req.body.code}, { 
                    members: members
                }, function (err, docs) {
                    if (err) {
                        console.log("ERROR adding user to group: " + err);
                        req.session.message = "Error adding to group";
                        req.session.error = "Are you sure the code was correct?";
                        req.session.redirect = '/groups';
                        return res.redirect('/genError');
                    } else {
                        let userAddStr = req.user.addStr;
                        userAddStr.groups.push(req.body.code);
                        User.findOneAndUpdate({"username": req.user.username}, { 
                            addStr: userAddStr
                        }, function (err, docs) {
                            if (err) {
                                console.log("ERROR adding user to group: " + err);
                                req.session.message = "Error adding to group";
                                req.session.error = "Are you sure the code was correct?";
                                req.session.redirect = '/groups';
                                return res.redirect('/genError');
                            } else {
                                return res.redirect('/group/' + req.body.code + '/Joined group!');
                            }
                        });
                    }
                });
            } else {
                return res.redirect("/group/" + req.body.code + "/You're already part of this group.");
            }
        } catch (err) {
            console.log("ERROR finding group: " + err);
            return res.redirect('/noGroup');
        }
    }).clone();
});

app.post('/createGroup', ensureLogin, async (req, res) => {
    let groupName = req.body.groupName.trim();
    try {
        let groupDescription = req.body.groupDescription.trim();
        let hash = generateHash();
        const group = new Group({
            id: hash,
            members: [req.user.username],
            information: {
                groupName: groupName,
                groupDescription: groupDescription,
                admins: [req.user.username],
                leader: req.user.username,
                profilePic: ""
            }
        });
        group.save();
        let tempInfo = req.user.addStr;
        tempInfo.groups.push(hash);
        await User.findOneAndUpdate({'username': req.user.username}, { 
            addStr: tempInfo
        }, function (err, docs) {
            if (err) {
                console.log("ERROR removing user from group: " + err);
                return;
            } else {
                return;
            }
        }).clone();
        res.redirect('/group/' + hash);
    } catch (err) {
        console.log("ERROR creating group " + groupName + ": " + err);
        return res.redirect('/groups');
    }
});

async function checkAdmins (admins, id, members, group) {
    if (members.length == 0) {
        Group.deleteOne({ "id" : group.id }).then(function(){
            return;
        });
    } else {
        for (let i = 0; i < admins.length; i++) {
            await User.findOne({ "username": admins[i] }, async function(err,user){
                if (!user) {
                    let tempAdmins = group.information.admins;
                    if (tempAdmins.length > 1) {
                        tempAdmins.splice(admins[i], 1);
                    } else {
                        tempAdmins = members[0];
                    }
                    Group.findOneAndUpdate({'id': id}, { 
                        admins: tempAdmins
                    }, function (err, docs) {
                        if (err) {
                            console.log("ERROR removing user from group: " + err);
                            return;
                        } else {
                            return;
                        }
                    });
                }
            }).clone();
        }
    }
    return admins;
}

async function checkLeader (leader, group, admins, members) {
    if (members.length == 0) {
        Group.deleteOne({ "id" : group.id }).then(function(){
            console.log("Group " + group.information.groupName + " deleted.");
            return;
        });
    } else {
        await User.findOne({ "username": leader }, async function(err,user){
            if (!user) {
                console.log("Leader not found");
                let tempAdmins = admins;
                if (tempAdmins.length > 1) {
                    tempAdmins.splice(leader, 1);
                } else {
                    console.log("Temp admins is " + members[0]);
                    tempAdmins[0] = members[0];
                }
                console.log("New admins: " + tempAdmins + ", new leader: " + tempAdmins[0]);
                let groupInformation = group.information;
                groupInformation.leader = tempAdmins[0];
                groupInformation.admins = tempAdmins;
                Group.findOneAndUpdate({'id': group.id}, { 
                    information: groupInformation
                }, function (err, docs) {
                    if (err) {
                        console.log("ERROR removing user from group: " + err);
                        return;
                    } else {
                        console.log("Updated leader");
                        return;
                    }
                });
            } else {
                return leader;
            }
        }).clone();
    }
    return leader;
}

app.get('/group/:group/:message', ensureLogin, async (req, res) => {
    let message = req.params.message;
    let groupNum = req.params.group;
    try {
        await Group.findOne({ "id": groupNum }, async function(e,group){
            try {
                if (group.members.includes(req.user.username)) {
                    let memberPriceArr = await generateGroupPriceArr(group, req.user.addStr);
                    res.render('groupPage', {
                        allowed: true,
                        members: await orderMembers(group.members, group),
                        memberPriceArr: memberPriceArr,
                        groupName: group.information.groupName,
                        groupDescription: group.information.groupDescription,
                        admins: await checkAdmins(group.information.admins, group.id, group.members, group),
                        name: req.user.styledUsername,
                        addStr: JSON.stringify(req.user.addStr),
                        leader: await checkLeader(group.information.leader, group, group.information.admins, group.members),
                        code: group.id,
                        message: message
                    });    
                } else {
                    res.redirect('/notInGroup');
                }
            } catch (err) {
                console.log("Error finding group: " + err);
                res.render('noGroup', {
                    name: req.user.styledUsername,
                    addStr: JSON.stringify(req.user.addStr)
                });
            }
        }).clone();
    } catch (err) {
        console.log("Error finding group: " + err);
        res.redirect('/notInGroup');
    }
});

app.get('/group/:group', ensureLogin, async (req, res) => {
    let groupNum = req.params.group;
    try {
        await Group.findOne({ "id": groupNum }, async function(e,group){
            try {
                if (group.members.includes(req.user.username)) {
                    let memberPriceArr = await generateGroupPriceArr(group, req.user.addStr);
                    res.render('groupPage', {
                        allowed: true,
                        members: await orderMembers(group.members, group),
                        memberPriceArr: memberPriceArr,
                        groupName: group.information.groupName,
                        groupDescription: group.information.groupDescription,
                        admins: await checkAdmins(group.information.admins, group.id, group.members, group),
                        name: req.user.styledUsername,
                        addStr: JSON.stringify(req.user.addStr),
                        leader: await checkLeader(group.information.leader, group, group.information.admins, group.members),
                        code: group.id,
                        message: ""
                    });    
                } else {
                    res.redirect('/notInGroup');
                }
            } catch (err) {
                console.log("Error finding group: " + err);
                res.render('noGroup', {
                    name: req.user.styledUsername,
                    addStr: JSON.stringify(req.user.addStr)
                });
            }
        }).clone();
    } catch (err) {
        console.log("Error finding group: " + err);
        res.redirect('/notInGroup');
    }
});

app.get('/notInGroup', (req, res) => {
    res.render('notInGroup', {
        name: req.user.styledUsername,
        addStr: JSON.stringify(req.user.addStr)
    });
});

app.post('/changeGroupName/:group', ensureLogin, async (req, res) => {
    const newName = req.body.name;
    if (newName.length > 19) {
        return res.redirect('/group/' + req.params.group + '/Name must be under 20 characters');
    } else if (newName.length <= 0) {
        return res.redirect('/group/' + req.params.group + "/Can't change name to nothing.");
    }
    await Group.findOne({ "id": req.params.group }, async function(e,group){
        try {
            let members = group.members;
            let information = group.information;
            information.groupName = newName;
            if (members.includes(req.user.username) && group.information.admins.includes(req.user.username)) {
                await Group.findOneAndUpdate({'id': req.params.group}, { 
                    information: information
                }, function (err, docs) {
                    if (err) {
                        console.log("ERROR changing group name: " + err);
                        return res.redirect('/accountSettings/msg/Error changing group name.  Try again?');
                    } else {
                        return res.redirect('/group/' + req.params.group + '/Changed group name!');
                    }
                }).clone();
            }
        } catch (err) {
            console.log("ERROR finding group: " + err);
            return;
        }
    }).clone();
});

app.post('/changeGroupDesc/:group', ensureLogin, async (req, res) => {
    const newDesc = req.body.description;
    if (newDesc.length > 170) {
        return res.redirect('/group/' + req.params.group + '/Description must be under 170 characters');
    } else if (newDesc.length <= 0) {
        return res.redirect('/group/' + req.params.group + "/Can't change description to nothing.");
    }
    await Group.findOne({ "id": req.params.group }, async function(e,group){
        try {
            let members = group.members;
            let information = group.information;
            information.groupDescription = newDesc;
            if (members.includes(req.user.username) && group.information.admins.includes(req.user.username)) {
                await Group.findOneAndUpdate({'id': req.params.group}, { 
                    information: information
                }, function (err, docs) {
                    if (err) {
                        console.log("ERROR changing group name: " + err);
                        return res.redirect('/accountSettings/msg/Error changing group bio.  Try again?');
                    } else {
                        return res.redirect('/group/' + req.params.group + '/Changed group description!');
                    }
                }).clone();
            }
        } catch (err) {
            console.log("ERROR finding group: " + err);
            return;
        }
    }).clone();
});

async function orderMembers (members, group) {

    let accountValues = [];
    let accountNames = [];
    
    accountNames = members;
    
    for (let i = 0; i < members.length; i++) {
        accountValues.push(parseFloat(await makeUserRequest(members[i], group)));
    }

    let indexArray = accountValues.map((val, index) => index);
    indexArray.sort((a, b) => accountValues[b] - accountValues[a]);
    let accountNamesSorted = indexArray.map((val) => accountNames[val]);

    return accountNamesSorted;
}

app.post('/deleteGroup/:group', ensureLogin, async (req, res) => {
    await Group.findOne({ "id": req.params.group }, async function(e,group){
        try {
            let members = group.members;
            if (members.includes(req.user.username) && group.information.leader == req.user.username) {
                Group.deleteOne({ "id" : req.params.group }).then(function(){
                    console.log("Group " + req.params.group + " deleted.");
                    return res.redirect('/accountSettings/msg/Deleted group!');
                }).catch(function(err){
                    console.log("ERROR deleting group: " + err);
                    return res.redirect('/accountSettings/msg/Error deleting group.  Try again?');
                });
            } else {
                return res.redirect('/group/' + req.params.group + "/Admins can't delete a group");
            }
        } catch (err) {
            console.log("ERROR finding group: " + err);
            return res.redirect('/group/' + req.params.group + '/Error deleting group');
        }
    }).clone();
});

async function removeMemberGroup (member, group, addStr) {
    User.findOneAndUpdate({'username': member}, { 
        
    }, function (err, docs) {
        if (err) {
            console.log("ERROR removing user from group: " + err);
            return res.redirect('/accountSettings/msg/Error leaving group.  Try again?');
        } else {
            let userAddStr = req.user.addStr;
            userAddStr.groups.splice(userAddStr.groups.indexOf(req.body.code), 1);
            User.findOneAndUpdate({"username": req.user.username}, { 
                addStr: userAddStr
            }, function (err, docs) {
                if (err) {
                    console.log("ERROR adding user to group: " + err);
                    req.session.message = "Error adding to group";
                    req.session.error = "Are you sure the code was correct?";
                    req.session.redirect = '/groups';
                    return res.redirect('/genError');
                } else {
                    return res.redirect('/accountSettings/msg/Left group.');
                }
            });
        }
    });
}

app.post('/leaveGroup/:group', ensureLogin, async (req, res) => {
    let groupId = req.params.group;
    await Group.findOne({ "id": groupId }, async function (err, group) {
        try {
            let members = group.members;
            for (let i = 0; i < members.length; i++) {
                if (members[i] == req.user.username) {
                    try {
                        let members = group.members;
                        if (members.includes(req.user.username)) {
                            members.splice(members.indexOf(req.user.username), 1);


                            //{{LOGIC FOR IF LEADER LEAVES}}


                            Group.findOneAndUpdate({'id': groupId}, { 
                                members: members
                            }, function (err, docs) {
                                if (err) {
                                    console.log("ERROR removing user from group: " + err);
                                    return res.redirect('/accountSettings/msg/Error leaving group.  Try again?');
                                } else {
                                    let userAddStr = req.user.addStr;
                                    userAddStr.groups.splice(userAddStr.groups.indexOf(req.body.code), 1);
                                    User.findOneAndUpdate({"username": req.user.username}, { 
                                        addStr: userAddStr
                                    }, function (err, docs) {
                                        if (err) {
                                            console.log("ERROR adding user to group: " + err);
                                            req.session.message = "Error adding to group";
                                            req.session.error = "Are you sure the code was correct?";
                                            req.session.redirect = '/groups';
                                            return res.redirect('/genError');
                                        } else {
                                            return res.redirect('/accountSettings/msg/Left group.');
                                        }
                                    });
                                }
                            });
                        } else {
                            console.log("User doesn't exist in group");
                            return res.redirect("/accountSettings/msg/You're not in this group!");
                        }
                    } catch (err) {
                        console.log("ERROR finding group: " + err);
                        return res.redirect("/accountSettings/msg/This group doesn't exist.");;
                    }
                }
            }
        } catch (err) {
            console.log("ERROR finding group: " + err);
            return;
        }
    }).clone();
});

app.post('/promoteUser/:group/:member', ensureLogin, async (req, res) => {
    const groupId = req.params.group;
    const member = req.params.member.toLowerCase();
    if (req.user.username == member) {
        return res.redirect("/group/" + groupId + "/You can't promote yourself");
    }
    await Group.findOne({ "id": groupId }, async function(e,group){
        try {
            if (group.members.includes(member)) {
                if (member == group.information.leader) {
                    return res.redirect("/group/" + groupId + "/You can't promote the leader");
                }
                if (group.information.admins.includes(req.user.username)) {
                    if (group.information.admins.includes(member)) {
                        if (group.information.leader == req.user.username) {
                            let tempInfo = group.information;
                            tempInfo.leader = member;
                            Group.findOneAndUpdate({"id": groupId}, { 
                                information: tempInfo 
                            }, function (err, docs) {
                                if (err) {
                                    console.log("ERROR promoting user to leader: " + err);
                                    req.session.message = "Error promoting new leader";
                                    req.session.error = "Try again?";
                                    req.session.redirect = '/groups/' + groupId;
                                    return res.redirect('/genError');
                                } else {
                                    return res.redirect('/group/' + groupId + '/Promoted new leader');
                                }
                            });
                        } else {
                            return res.redirect("/group/" + groupId + "/Admins can't promote to leader");
                        }
                    } else {
                        let informationTemp = group.information;
                        informationTemp.admins.push(member);
                        Group.findOneAndUpdate({"id": groupId}, { 
                            information: informationTemp 
                        }, function (err, docs) {
                            if (err) {
                                console.log("ERROR promoting user to admin: " + err);
                                req.session.message = "Error promoting user";
                                req.session.error = "Try again?";
                                req.session.redirect = '/groups/' + groupId;
                                return res.redirect('/genError');
                            } else {
                                console.log("Promoted user to admin");
                                return res.redirect('/group/' + groupId + '/Promoted user');
                            }
                        });
                    }
                } else {
                    console.log("ERROR: admins can't promote");
                    return res.redirect("/group/" + groupId + "/Only admins can promote");
                }
            } else {
                return res.redirect("/group/" + groupId + "/This user isn't in your group");
            }
        } catch (err) {
            console.log("ERROR finding group: " + err);
            return res.redirect("/group/" + groupId + "/Error promoting user. Try again?");
        }
    }).clone();
});

app.post('/demoteUser/:group/:member', ensureLogin, async (req, res) => {
    const groupId = req.params.group;
    const member = req.params.member.toLowerCase();
    await Group.findOne({ "id": groupId }, async function(e,group){
        try {
            if (member == req.user.username) {
                return res.redirect("/group/" + groupId + "/You can't demote yourself");
            }
            if (group.information.leader == req.user.username) {
                if (group.information.admins.includes(member)) {
                    let tempInfo = group.information;
                    tempInfo.admins.splice(tempInfo.admins.indexOf(member), 1);
                    Group.findOneAndUpdate({"id": groupId}, { 
                        information: tempInfo 
                    }, function (err, docs) {
                        if (err) {
                            console.log("ERROR demoting admin: " + err);
                            req.session.message = "Error demoting admin";
                            req.session.error = "Try again?";
                            req.session.redirect = '/groups/' + groupId;
                            return res.redirect('/genError');
                        } else {
                            return res.redirect('/group/' + groupId + '/Demoted admin');
                        }
                    });
                } else {
                    return res.redirect('/group/' + groupId + "/User isn't an admin.  Kick instead?");
                }
            } else {
                return res.redirect("/group/" + groupId + "/Only the leader can demote");
            }
        } catch (err) {
            console.log("ERROR demoting user: " + err);
            return res.redirect("/group/" + groupId + "/Error demoting user");
        }
    }).clone();
});

app.post('/kickUser/:group/:member', ensureLogin, async (req, res) => {
    const member = req.params.member.trim();
    const groupId = req.params.group.trim();
    await Group.findOne({ "id": groupId }, async function(e,group){
        try {
            if (req.user.username == member) {
                return res.redirect("/group/" + groupId + "/You can't kick yourself.  Leave instead.");
            }
            if (group.information.leader == member) {
                return res.redirect("/group/" + groupId + "/Leader can't be kicked");
            }
            if (group.members.includes(member)) {
                if (group.information.admins.includes(req.user.username)) {
                    if (group.information.admins.includes(member)) {
                        if (group.information.leader == req.user.username) {
                            let tempMembers = group.members;
                            let tempInfo = group.information;
                            tempInfo.admins.splice(tempInfo.admins.indexOf(member), 1);
                            tempMembers.splice(group.members.indexOf(member), 1);
                            Group.findOneAndUpdate({'id': groupId}, { 
                                members: tempMembers,
                                information: tempInfo
                            }, function (err, docs) {
                                if (err) {
                                    console.log("ERROR kicking user: " + err);
                                    return res.redirect("/group/" + groupId + "/Error kicking user.  Try again?");
                                } else {
                                    User.findOne({username:member}, async function (error, user) {
                                        if (!error) {
                                            let tempAddStr = user.addStr;
                                            tempAddStr.groups.splice(group.information.groupName);
                                            User.findOneAndUpdate({'username': member}, { 
                                                addStr: tempAddStr
                                            }, function (err, docs) {
                                                if (err) {
                                                    console.log("Error kicking user: " + err);
                                                    return res.redirect("/group/" + groupId + "/Error kicking user.  Try again?");
                                                } else {
                                                    console.log("Kicked user");
                                                    return res.redirect("/group/" + groupId + "/Kicked user");
                                                }
                                            });
                                        } else {
                                            console.log("Error kicking user from group: " + error);
                                            return res.redirect("/group/" + groupId + "/Error kicking user.  Try again?");
                                        }
                                    });
                                }
                            });
                        } else {
                            return res.redirect("/group/" + groupId + "/Admins can't kick each other");
                        }
                    } else {
                        let tempMembers = group.members;
                        tempMembers.splice(group.members.indexOf(member), 1);
                        Group.findOneAndUpdate({'id': groupId}, { 
                            members: tempMembers
                        }, function (err, docs) {
                            if (err) {
                                console.log("ERROR kicking user: " + err);
                                return res.redirect("/group/" + groupId + "/Error kicking user.  Try again?");
                            } else {
                                User.findOne({username:member}, async function (error, user) {
                                    if (!error) {
                                        let tempAddStr = user.addStr;
                                        tempAddStr.groups.splice(group.information.groupName);
                                        User.findOneAndUpdate({'username': member}, { 
                                            addStr: tempAddStr
                                        }, function (err, docs) {
                                            if (err) {
                                                console.log("Error kicking user: " + err);
                                                return res.redirect("/group/" + groupId + "/Error kicking user.  Try again?");
                                            } else {
                                                console.log("Kicked user");
                                                return res.redirect("/group/" + groupId + "/Kicked user");
                                            }
                                        });
                                    } else {
                                        console.log("Error kicking user from group: " + error);
                                        return res.redirect("/group/" + groupId + "/Error kicking user.  Try again?");
                                    }
                                });
                            }
                        });
                    }
                } else {
                    return res.redirect("/group/" + groupId + "/Must be admin member to kick");
                }
            } else {
                return res.redirect("/group/" + groupId + "/User not in group");
            }
        } catch (err) {
            console.log("ERROR demoting user: " + err);
            return res.redirect("/group/" + groupId + "/Error kicking user");
        }
    }).clone();
});

async function generateGroupPriceArr (group, addStr) {
    let memberPriceArr = [];
    for (let i = 0; i < group.members.length; i++) {
        memberPriceArr.push(await doConversion(addStr.currency, await makeUserRequest(group.members[i], group)));
    }
    memberPriceArr.sort((a, b) => b - a);
    return memberPriceArr;
}

async function makeUserRequest (member, group) {
    return new Promise((resolve, reject) => {
        User.findOne({ username: member }, function(err, user) {
            if (err) {
                console.log("ERROR getting last value for group member: " + err);
                resolve("Error");
            }
            if (!user) {
                console.log("ERROR: user in group doesn't exist");
                removeGroupMember(group.id, member);
                resolve("Error - deleted account");
            } else {
                resolve(user.lastValue);
            }
        }).clone();
    });
}

async function removeGroupMember (groupId, username) {
    await Group.findOne({ "id": groupId }, async function(e,group){
        try {
            let members = group.members;
            if (members.includes(username)) {
                members.splice(members.indexOf(username), 1);
                Group.findOneAndUpdate({'id': groupId}, { 
                    members: members
                }, function (err, docs) {
                    if (err) {
                        console.log("ERROR removing user from group: " + err);
                        return;
                    } else {
                        console.log("Removed group member");
                        return;
                    }
                });
            } else {
                console.log("User doesn't exist in group");
                return;
            }
        } catch (err) {
            console.log("ERROR finding group: " + err);
            return;
        }
    }).clone();
}

function generateHash() {
    return Math.random().toString(36).slice(-8);
}

app.get('/noUser', (req, res) => {
    if (req.user) {
        res.render('noUser', {
            name: req.user.styledUsername,
            addStr: JSON.stringify(req.user.addStr)
        });
    } else {
        res.render('noUser', {
            name: "Sign up",
            addStr: JSON.stringify(defaultAddStr),
        });
    }
});

app.get('/noGroup', ensureLogin, (req, res) => {
    res.render('noGroup', {
        name: req.user.styledUsername,
        addStr: JSON.stringify(req.user.addStr)
    });
});

app.get('/settings', ensureLogin, (req, res) => {
    res.render('settings', {
        name: req.user.styledUsername,
        addStr: JSON.stringify(req.user.addStr),
        eduAct: req.user.eduAct,
        email: req.user.email
    });
});

let allStockRtn = [];
async function getAllStocks () {
    const cursor = Tickers.find().cursor();
    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
        //Get account value, sell at market open
        allStockRtn = doc.tickers;
    }
    return allStockRtn;
}

app.get('/market/msg/:message', ensureLogin, async (req, res) => {
    allStockRtn = await getAllStocks();
    const message = req.params.message.charAt(0).toUpperCase() + req.params.message.slice(1);
    if (req.user) {
        res.render('market', {
            tickerArr: allStockRtn,
            name: req.user.styledUsername,
            dispSub: true,
            addStr: JSON.stringify(req.user.addStr),
            message: message
        });
    } else {
        res.render('market', {
            tickerArr: allStockRtn,
            name: "Sign up",
            addStr: JSON.stringify(defaultAddStr),
            dispSub: false,
            message: message
        });
    }
});

app.get('/market', async (req, res) => {
    allStockRtn = await getAllStocks();
    if (req.user) {
        res.render('market', {
            tickerArr: allStockRtn,
            name: req.user.styledUsername,
            dispSub: true,
            darkMode: 'dark',
            addStr: JSON.stringify(req.user.addStr),
            message: "NODISP"
        });
    } else {
        res.render('market', {
            tickerArr: allStockRtn,
            name: "Sign up",
            darkMode: 'light',
            addStr: JSON.stringify(defaultAddStr),
            dispSub: false,
            message: "NODISP"
        });
    }
});

//////////

async function generatePriceArr (posString) {
    let tempReturn = "";
    for (let d = 0; d < posString.length; d++) {
        tempReturn += ";" + posString[d].ticker + '|' + await getStockPrice(posString[d].ticker) + "#(" + await getStockPerc(posString[d].ticker) + "%)";
    }
    return tempReturn;
}

//PRICE
async function getStockPrice (ticker) {
    return new Promise(function(resolve, reject) { 
        request('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/'+(ticker.toUpperCase())+'?apiKey=' + polygonKey, function (error, response, body) {
            if (!error) {
                try {
                    const obj = JSON.parse(body);
                    const value = parseFloat(JSON.stringify(obj.ticker.min.vw));
                    if (value == 0) {
                        const altValue2 = parseFloat(JSON.stringify(obj.ticker.prevDay.c))
                        if (altValue2 == 0) {
                            const altValue = (parseFloat(JSON.stringify(obj.ticker.lastQuote.p))+parseFloat(JSON.stringify(obj.ticker.lastQuote.P)))/2;
                            resolve(altValue);
                        } else {
                            resolve(altValue2);
                        }
                    } else {
                        resolve(value);
                    }
                } catch (err) {
                    console.log("ERROR getting data for " + ticker + ": " + err);
                    resolve(0);
                }
            } else {
                console.log("ERROR GETTING DATA FOR " + ticker.toUpperCase());
            }
        });  
    });
}

//PERC
let e;
async function getStockPerc (ticker) {
    e = '';
    return new Promise(function(resolve, reject) { 
        request('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/'+(ticker.toUpperCase())+'?apiKey=' + polygonKey, function (error, response, body) {
            if (!error) {
                try {
                    const obj = JSON.parse(body);
                    e = parseFloat(JSON.stringify(obj.ticker.todaysChangePerc));
                    resolve(e.toFixed(2));
                } catch (err) {
                    console.log("ERROR getting data for " + ticker + ": " + err);
                    resolve(0);
                }
            } else {
                console.log("ERROR GETTING DATA");
            }
        });  
    })
}

app.get('/blog', (req, res) => {
    res.render('rehrwehkjrew');
});

app.get('/blog/:article', (req, res) => {
    let article = req.params.article.trim().toLowerCase();
    if (fs.existsSync('views/articles/'+article+'.ejs')) {
        if (req.user) {
            res.render('articles/' + article, {
                name: req.user.styledUsername,
                addStr: req.user.addStr
            });
        } else {
            res.render('articles/' + article, {
                name: 'Sign up',
                addStr: defaultAddStr
            });
        }
    } else {
        if (req.user) {
            res.render('articleDoesntExist', {
                name: req.user.styledUsername,
                addStr: req.user.addStr
            });
        } else {
            res.render('articleDoesntExist', {
                name: 'Sign up',
                addStr: defaultAddStr
            });
        }
    }
});

app.post('/smsUserCount', async (req, res) => {
    User.count({}, async function(err, userCount) {
        if (!err) {
            Group.count({}, async function(err, groupCount) {
                if (!err) {
                    let result = await User.find({registerTime: getFormattedDate()});
                    
                    client.messages.create({
                        body: `New users today: ` + result.length + `, Total users: ` + userCount + `, Total groups: ` + groupCount,
                        from: '+12055393207',
                        to: '+15712764233'
                    }).then( function (message) {
                        console.log("Summary message sent!");
                        res.end();
                    }).catch(function (err) {
                        console.log("ERROR sending summary message: " + err);
                        res.end();
                    });   
                } else {
                    console.log("ERROR getting group count: " + err);
                    res.end();
                }
            });
        } else {
            console.log("ERROR getting user count: " + err);
            res.end();
        }
    });
});


//////////

const robotText = fs.readFileSync("robotText.txt");
app.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send(robotText);
});
app.get('/reginfo', (req, res) => {
    res.render('registerInfo', {
        addStr: JSON.stringify(defaultAddStr),
    });
});

const stockActionRouter = require('./stockActions');
const userProfileRouter = require('./routes/users');
const emailRouter = require('./routes/emailRouter');
const stockDataRouter = require('./routes/stockData');
const homeRouter = require('./routes/homeRouter');
const leaderboardRouter = require('./routes/leaderboardRouter');
const autoRouter = require('./routes/autoRouter');

app.use('/actions', autoRouter);
app.use('/stock', stockDataRouter);
app.use('/email', emailRouter);
app.use('/user', userProfileRouter);
app.use('/stockAct', stockActionRouter);
app.use('/leaderboards', leaderboardRouter);
app.use('/', homeRouter);

//Directory linking
var path = require ('path');
const { runInNewContext } = require('vm');

app.use(express.static(path.join(__dirname + '../static')));
app.use(express.static('static'));
app.use(express.static('static/css'));
app.use(express.static('static/images'));
app.use(express.static('static/scripts'));
app.use(express.static('static/pressKit'));
app.use(express.static('static/documents'));



//404
app.get('*', function(req, res) {
    console.log("404 from server.js: " + req.protocol + '://' + req.get('host') + req.originalUrl);
    if (req.user) {
        res.status(404).render('404', {
            addStr: JSON.stringify(req.user.addStr)
        });
    } else {
        res.status(404).render('404', {
            addStr: JSON.stringify(defaultAddStr),
        });
    }
});

app.listen(process.env.PORT || 3000);

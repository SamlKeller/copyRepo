require('dotenv').config();

const express = require('express');
const router = express.Router();
router.use(express.static('static'));
const request = require('request');

const User = require('../Schemas/userSchema');
const Group = require('../Schemas/groupSchema');

const bodyParser = require('body-parser');
const CC = require('currency-converter-lt');

router.use(bodyParser.urlencoded({ extended: false }));
router.use(bodyParser.json());

let accountValueTemp = 0;

let DEVELOPMENT = false;

const polygonKey = process.env.POLYGONAPIKEY;


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



async function get100 (currency) {
    let convertedValue = 0;
    let currencyConverter = new CC({from:"USD", to: currency, amount:100000});
    await currencyConverter.convert().then((response) => {
        convertedValue = parseFloat(response);  
    });
    return convertedValue;
}
  
async function doConversion (currency, amount) {
    let convertedValue = 0;
    let currencyConverter = new CC({from:"USD", to: currency, amount:parseFloat(amount)});
    await currencyConverter.convert().then((response) => {
        convertedValue = parseFloat(response);  
    });
    return convertedValue;
}

function ensureEmailVerified (req, res, next) {
    if (req.user) {
        if (req.user.emailVerified == "true") {
            return next();
        }
    }
    res.redirect('/verifyEmail');
}

function ensureLogin (req, res, next) {
    if (req.isAuthenticated()) {
      return next();
    }
    res.redirect('/onboarding');
}

async function doFormat (num) {
    const formatter = Intl.NumberFormat('en', { 
        notation: 'compact', 
        maximumSignificantDigits: 7
    });

    //These conversions are incredibly annoying but ultimately forced
    if (await num >= 1e+11) {
        const frm = formatter.format(await num);
        return frm;
    } else {
        const strNum = (await parseFloat(num).toFixed(2)).toLocaleString(undefined, {
            minimumFractionDigits: 2
        });
        return "$" + (strNum.replace(/(\d)(?=(\d{3})+\.)/g, '$1,'));
    }
}

async function queryGroups (groups) {
    let groupArr = [];
    for (let i = 0; i < groups.length; i++) {
        groupArr.push(await makeGroupNameQuery(groups[i]));
    }
    return groupArr;
}

async function makeGroupNameQuery (id) {
    return new Promise((resolve, reject) => {
        Group.findOne({ id: id }, function(err, group) {
            if (err) {
                resolve("Error");
            }
            if (!group) {
                resolve("Error");
            } else {
                resolve(group.information.groupName);
            }
        }).clone();
    });
}

router.get('/tutorial', ensureLogin, async (req, res) => {
    let currency = req.user.addStr.currency;
    if (!DEVELOPMENT) {
        await iteratePositions(req.user.posString);
        if (accountValueTemp.toString() == "null" || isNaN(accountValueTemp.toString())) {
            console.log("ERROR: Account value null or NaN: " + accountValueTemp);
            res.render('index', {
                buyingPower: "00.00",
                name: req.user.styledUsername,
                emailVerified: req.user.emailVerified,
                addStr: JSON.stringify(req.user.addStr),
                groups: await queryGroups(JSON.parse(JSON.stringify(req.user.addStr)).groups),
                groupIds: JSON.parse(JSON.stringify(req.user.addStr)).groups,
                groupPositions: await getUserGroupPosition(req.user.addStr, req.user.lastValue),
                positionString: "--|--|--|--",
                accountValue: "Error",
                displayVer: "false",
                accountPercentageChange: "--.--",
                stockPosArr: req.user.posString,
                valueHistory: req.user.valueHistory,
                stockPriceArr: "",
                tutorial: true
            });
        } else {
            updateInformation(req.user.id, accountValueTemp, req.user.buyingPower, req.user.styledUsername);
            if (currency != 'USD') {
                res.render('index', {
                    buyingPower: await doConversion(currency, req.user.buyingPower),
                    name: req.user.styledUsername,
                    emailVerified: req.user.emailVerified,
                    addStr: JSON.stringify(req.user.addStr),
                    groups: await queryGroups(JSON.parse(JSON.stringify(req.user.addStr)).groups),
                    groupIds: JSON.parse(JSON.stringify(req.user.addStr)).groups,
                    groupPositions: await getUserGroupPosition(req.user.addStr, req.user.lastValue),
                    positionString: req.user.posString,
                    valueHistory: req.user.valueHistory,
                    accountValue: await doFormat(await doConversion(currency, accountValueTemp + req.user.buyingPower)),
                    displayVer: "false",
                    accountPercentageChange: await getValuePerc(await doConversion(currency, accountValueTemp + req.user.buyingPower), await doConversion(currency, await req.user.lastValue)),
                    stockPosArr: req.user.posString,
                    stockPriceArr: await convertPriceArr(currency, await generatePriceArr(req.user.posString)),
                    tutorial: true   
                });
            } else {
                res.render('index', {
                    buyingPower: req.user.buyingPower,
                    name: req.user.styledUsername,
                    emailVerified: req.user.emailVerified,
                    addStr: JSON.stringify(req.user.addStr),
                    groups: await queryGroups(JSON.parse(JSON.stringify(req.user.addStr)).groups),
                    groupIds: JSON.parse(JSON.stringify(req.user.addStr)).groups,
                    groupPositions: await getUserGroupPosition(req.user.addStr, req.user.lastValue),
                    positionString: req.user.posString,
                    valueHistory: req.user.valueHistory,
                    accountValue: await doFormat(accountValueTemp + req.user.buyingPower),
                    displayVer: "false",
                    accountPercentageChange: await getValuePerc(accountValueTemp + req.user.buyingPower, await req.user.lastValue),
                    stockPosArr: req.user.posString,
                    stockPriceArr: await generatePriceArr(req.user.posString),
                    tutorial: true   
                });
            }
        }
    } else {
        res.render('index', {
            buyingPower: 1029.88,
            name: "SamuelKeller",
            positionString: defaultPosString,
            updtTxt: "LASTTIME",
            valueHistory: "|131793.0449999997!11-06-2022|124215.61079999967!11-11-2022|125279.70919999968!11-14-2022|127761.04499999968!11-15-2022|140126.7904!11-29-2022|142868.1007!11-30-2022|144691.38520000002!12-01-2022|147513.7458!12-02-2022|143139.83179999999!12-05-2022|141686.8346!12-06-2022|140393.0596!12-07-2022",
            addStr: defaultAddStr,
            accountValue: "$692,219.88",
            emailVerified: "false",
            displayVer: "false",
            accountPercentageChange: "+4.2189%",
            amountDiff: "30.68",
            stockPosArr: "|3175!GME@31.96",
            tutorial: true,
            stockPriceArr: ";DOGE-USD|27.36#(2.98%);IBM|127.79#(-1.44%);BTC-USD|19881.723#(-0.17%);DVAX|11.21#(3.28%)"
        });
    }
});

router.get('/', ensureLogin, (req, res) => {
    res.render('loading', {
        addStr: JSON.stringify(req.user.addStr)
    });
});

router.get('/fin/home', ensureLogin, async (req, res) => {
    accountValueTemp = 0;
    if (!DEVELOPMENT) {
        await iteratePositions(req.user.posString);
        let currency = req.user.addStr.currency;
        if (!accountValueTemp && req.user.posString.length != 0) {
            console.log("ERROR: account value null or NaN: " + accountValueTemp);
            res.render('index', {
                buyingPower: "00.00",
                name: req.user.styledUsername,
                emailVerified: req.user.emailVerified,
                addStr: JSON.stringify(req.user.addStr),
                groups: await queryGroups(JSON.parse(JSON.stringify(req.user.addStr)).groups),
                groupIds: JSON.parse(JSON.stringify(req.user.addStr)).groups,
                groupPositions: await getUserGroupPosition(req.user.addStr, req.user.lastValue),
                positionString: "--|--|--|--",
                accountValue: "Error",
                displayVer: "false",
                accountPercentageChange: "--.--",
                stockPosArr: req.user.posString,
                valueHistory: req.user.valueHistory,
                stockPriceArr: "",
                tutorial: false
            });
        } else {
            updateInformation(req.user.id, accountValueTemp, req.user.buyingPower, req.user.styledUsername);
            if (currency != 'USD') {
                res.render('index', {
                    buyingPower: await doConversion(currency, req.user.buyingPower),
                    name: req.user.styledUsername,
                    emailVerified: req.user.emailVerified,
                    addStr: JSON.stringify(req.user.addStr),
                    groups: await queryGroups(JSON.parse(JSON.stringify(req.user.addStr)).groups),
                    groupIds: JSON.parse(JSON.stringify(req.user.addStr)).groups,
                    groupPositions: await getUserGroupPosition(req.user.addStr, req.user.lastValue),
                    positionString: req.user.posString,
                    valueHistory: req.user.valueHistory,
                    accountValue: await doFormat(await doConversion(currency, accountValueTemp + req.user.buyingPower)),
                    displayVer: "false",
                    accountPercentageChange: await getValuePerc(await doConversion(currency, accountValueTemp + req.user.buyingPower), await doConversion(currency, await req.user.lastValue)),
                    stockPosArr: req.user.posString,
                    stockPriceArr: await convertPriceArr(currency, await generatePriceArr(req.user.posString)),
                    tutorial: false   
                });
            } else {
                res.render('index', {
                    buyingPower: req.user.buyingPower,
                    name: req.user.styledUsername,
                    emailVerified: req.user.emailVerified,
                    addStr: JSON.stringify(req.user.addStr),
                    groups: await queryGroups(JSON.parse(JSON.stringify(req.user.addStr)).groups),
                    groupIds: JSON.parse(JSON.stringify(req.user.addStr)).groups,
                    groupPositions: await getUserGroupPosition(req.user.addStr, req.user.lastValue),
                    positionString: req.user.posString,
                    valueHistory: req.user.valueHistory,
                    accountValue: await doFormat(accountValueTemp + req.user.buyingPower),
                    displayVer: "false",
                    accountPercentageChange: await getValuePerc(accountValueTemp + req.user.buyingPower, await req.user.lastValue),
                    stockPosArr: req.user.posString,
                    stockPriceArr: await generatePriceArr(req.user.posString),
                    tutorial: false   
                });
            }
        }
    } else {
        res.render('index', {
            buyingPower: 1029.88,
            name: "SamuelKeller",
            positionString: defaultPosString,
            updtTxt: "LASTTIME",
            valueHistory: "|131793.0449999997!11-06-2022|124215.61079999967!11-11-2022|125279.70919999968!11-14-2022|127761.04499999968!11-15-2022|140126.7904!11-29-2022|142868.1007!11-30-2022|144691.38520000002!12-01-2022|147513.7458!12-02-2022|143139.83179999999!12-05-2022|141686.8346!12-06-2022|140393.0596!12-07-2022",
            addStr: defaultAddStr,
            accountValue: "$692,219.88",
            emailVerified: "false",
            displayVer: "false",
            accountPercentageChange: "+4.2189%",
            amountDiff: "30.68",
            stockPosArr: "|3175!GME@31.96",
            tutorial: false,
            stockPriceArr: ";DOGE-USD|27.36#(2.98%);IBM|127.79#(-1.44%);BTC-USD|19881.723#(-0.17%);DVAX|11.21#(3.28%)"
        });
    }
});

async function generatePriceArr (posString) {
    let tempReturn = "";
    if (posString.length > 0 && posString[0] != "") {
        if (posString.length > 5) {
            for (let d = 0; d < posString.length; d++) {
                tempReturn += ";" + posString[d].ticker + '|' + await getStockPrice(posString[d].ticker) + "#(" + await getStockPerc(posString[d].ticker) + "%)";
            }            
        } else {
            for (let d = 0; d < posString.length; d++) {
                tempReturn += ";" + posString[d].ticker + '|' + await getStockPrice(posString[d].ticker) + "#(" + await getStockPerc(posString[d].ticker) + "%)";
            }
        }
    }
    return tempReturn;
}

async function convertPriceArr (currency, priceArr) {
    let newPriceArr = "";
    for (let e = 1; e < priceArr.split(';').length; e++) {
        newPriceArr += ';' + priceArr.split(';')[e].split('|')[0] + '|' + await doConversion(currency, priceArr.split('|')[e].split('#')[0]) + '#' + priceArr.split(';')[e].split('#')[1];
    }
    return newPriceArr;
}

async function getValuePerc (todVal, yestVal) {
    if (todVal == 100000 && yestVal == 0) { 
        return "+--.--%";
    }
    if (yestVal < todVal) {
        //Increase
        return "+"+(100*((todVal-yestVal)/yestVal)).toFixed(2) + "%";
    } else if (yestVal > todVal) {
        //Decrease
        return -(100*((yestVal-todVal)/yestVal)).toFixed(4) + "%";
    } else if (yestVal.toFixed(4) == todVal.toFixed(4)) {
        return "+0.00%";
    } else {
        console.log("Error getting account value percentage change");
    }
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

async function getUserGroupPosition (addStr, lastValue) {
    let returnArr = [];
    for (let i = 0; i < addStr.groups.length; i++) {
        returnArr.push(await makeGroupPositionRequest(addStr.groups[i], lastValue));
    }
    return returnArr;
}

async function makeGroupPositionRequest (id, lastValue) {
    const groupTemp = await getGroup(id);
    let tempAggregate = [];
    if (groupTemp != "Error") {
        for (let i = 0; i < groupTemp.members.length; i++) {
            tempAggregate.push(await makeUserRequest(groupTemp.members[i]));
        }
        tempAggregate.sort(function(a, b){return b-a});
        return tempAggregate.indexOf(lastValue) + 1;
    }
}

async function makeUserRequest (username) {
    return new Promise(function(resolve, reject) {
        User.findOne({username: username}, async function(err, user) {
            if (err) {
                resolve(100000);
            }
            if (!user) {
                resolve(100000);
            } else {
                resolve(user.lastValue);
            }
        });
    });
}

async function getGroup (id) {
    return new Promise(function (resolve, reject) {
        Group.findOne({ id: id }, function(err, group) {
            if (err) {
                resolve("Error");
            }
            if (!group) {
                resolve("Error");
            } else {
                resolve(group);
            }
        }).clone();
    });
}

//PERC
async function getStockPerc (ticker) {
    return new Promise(function(resolve, reject) { 
        request('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/'+(ticker.toUpperCase())+'?apiKey=' + polygonKey, function (error, response, body) {
            if (!error) {
                try {
                    const obj = JSON.parse(body);
                    let e = parseFloat(JSON.stringify(obj.ticker.todaysChangePerc));
                    resolve(e.toFixed(2));
                } catch (err) {
                    console.log("ERROR with " + ticker + ": " + err);
                    resolve(0);
                }
            } else {
                console.log("ERROR GETTING DATA FOR " + ticker + ": " + error);
            }
        });  
    })
}

//GET ACCOUNT VALUE

async function iteratePositions (posString) {
    accountValueTemp = 0;
    for (let i = 0; i < posString.length; i++) {
        if (posString[i].ticker != "") {
            await makeRequest(posString[i].ticker, posString[i].number);
        }
    }
}

function addAccountValue (value, num) {
    accountValueTemp += value * num;
}

/*async function makeRequest (ticker, num) {
    return new Promise(function(resolve, reject) {
        request('https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/' + ticker + '?apiKey=' + polygonKey, function (error, response, body) {
            if (!error) {
                try {
                    const obj = JSON.parse(body);
                    const value = parseFloat(JSON.stringify(obj.ticker.min.vw));
                    if (value == 0) {
                        const altValue = (parseFloat(JSON.stringify(obj.ticker.lastQuote.p))+parseFloat(JSON.stringify(obj.ticker.lastQuote.P)))/2;
                        if (altValue == 0) {
                            const altValue2 = parseFloat(JSON.stringify(obj.ticker.prevDay.c))
                            addAccountValue(altValue2, num);                            
                            resolve(accountValueTemp);
                        } else {
                            addAccountValue(altValue, num);
                            resolve(accountValueTemp);
                        }
                    } else {
                        addAccountValue(value, num);
                        resolve(accountValueTemp);
                    }
                } catch (err) {
                    console.log("ERROR with " + ticker + ": " + err);
                    resolve(0);
                }
            } else {
                console.log("ERROR GETTING DATA FOR " + ticker + ": " + error);
            }
        });  
    })
}*/

async function makeRequest (ticker, num) {
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
                            addAccountValue(altValue, num);                            
                            resolve(accountValueTemp);
                        } else {
                            addAccountValue(altValue2, num);                            
                            resolve(accountValueTemp);
                        }
                    } else {
                        addAccountValue(value, num);                            
                        resolve(accountValueTemp);
                    }
                } catch (err) {
                    console.log("ERROR getting data for " + ticker + ": " + err);
                    resolve(accountValueTemp);
                }
            } else {
                console.log("ERROR GETTING DATA FOR " + ticker.toUpperCase());
            }
        });  
    });
}

//SET ACCOUNT VALUE

function updateInformation (id, value, buyingPower, name) {
    User.findByIdAndUpdate(id, {  
        USDvalue: value + buyingPower
    }, function (err, docs) {
        if (err){
            console.log("Error updating account data");
        } else {
            console.log(name + "'s homepage loaded");
        }
    });
}

function marketOpen () {
    request('https://api.polygon.io/v1/marketstatus/now?apiKey=' + polygonKey, function (error, response, body) {
            if (!error) {
                try {
                    const obj = JSON.parse(body);
                    if (obj.exchanges.nasdaq == "closed") {
                        resolve(false);
                    } else if (obj.exchanges.nasdaq == "open") {
                        resolve(true);
                    } else {
                        console.log("ERROR getting market status");
                        resolve(0);                        
                    }
                } catch (err) {
                    console.log("ERROR getting market status: " + err);
                    resolve(0);
                }
            } else {
                console.log("ERROR getting market status: " + error);
            }
        });
}


module.exports = router;

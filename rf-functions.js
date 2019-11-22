/**
 * rf-function.js
 * RichFlyerの機能を使用するための関数群です。
 *
 * 当ファイルは編集して利用しないでください。
 * お客様で編集した場合の動作の保証はできかねますのでご了承ください
 * Copyright © 2019年 INFOCITY,Inc. All rights reserved.
 */

const rfApiDomain = "https://api.richflyer.net";

let rfUserDomain = ""; //<- 呼び出し元から受け取る
let rfServiceKey = ""; //<- 呼び出し元から受け取る

let rfSubscription = null;

/**
 * 処理内で使用する変数に購読情報を代入します。
 * @param {PushSubscription} sub ブラウザから取得したwebプッシュの購読情報
 */
function rf_setSubscription(sub) {
    rfSubscription = sub;
}

/**
 * イニシャライズ処理を実行します
 * @param {string} key RichFlyerで発行されるSDK実行キー
 * @param {string} domain プッシュ通知を許可するウェブサイトのドメイン
 */
function rf_init(key, domain) {
    rfServiceKey = key;
    rfUserDomain = domain;
}

/**
 * RichFlyerサーバーに通知を受け取るブラウザを登録します。
 * @param {PushSubscription} sub Webプッシュ購読情報
 */
async function rf_activateDevice(sub) {
    //デバイス登録API_URL
    let setDeviceAPIURL = rfApiDomain + "/v1/devices/webpush";

    try{
        const endpoint = sub.endpoint;
        const p256dh = btoa(
            String.fromCharCode.apply(
                null,
                new Uint8Array(sub.getKey("p256dh"))
            )
        )
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
        const auth = btoa(
            String.fromCharCode.apply(
                null,
                new Uint8Array(sub.getKey("auth"))
            )
        )
        .replace(/\+/g, "-")
        .replace(/\//g, "_");

        // device登録APIの実行
        const apiResponse = await fetch(setDeviceAPIURL, {
            method: "POST",
            mode: "cors",
            headers: {
                "Content-Type": "application/json; charset=UTF-8",
                "X-API-Version": "2017-04-01",
                "X-Service-Key": rfServiceKey,
            },
            body: JSON.stringify({
                endpoint: endpoint,
                p256dh: p256dh,
                auth: auth,
                domain: rfUserDomain,
            }),
        });

        if(apiResponse.status == 200){ // 成功の場合は200しか返さないので200で判定
            return true;    // デバイス登録成功
        }else{
            const errJson = await apiResponse.json();
            console.log("status:" + apiResponse.status + " msg:" + errJson.message);
            return false;   // デバイス登録失敗(殆どの場合はデバイス用実行キーの入力ミス)
        }

    }catch(e){
        console.log(e);
        return false;
    }

}

function decodeBase64URL(str) {
    const dec = atob(str.replace(/\-/g, "+").replace(/_/g, "/"));
    const buffer = new Uint8Array(dec.length);
    for (let i = 0; i < dec.length; i++) buffer[i] = dec.charCodeAt(i);
    return buffer;
}

/**
 * サーバーの公開鍵を取得します。
 * 取得した公開鍵を使用してWebプッシュの購読処理を行います。
 * @return {string} 公開鍵
 */
async function rf_getServerPublicKey() {
    let appServerPublicKeyURL = rfApiDomain + "/v1/webpush/key";
    const apiResponse = await fetch(appServerPublicKeyURL);
    return await apiResponse.text();
}

/**
 * 認証キーを取得します。
 * 認証キーはローカルストレージで保持されRichFlyer APIで使用されます。
 * rfSubscriptionにPushSubscriptionオブジェクトを格納後に実行する必要があります。
 * @return 結果
 */
async function rf_createAuthKey() {
    if (!rfSubscription){
        console.log("rfSubscription undefined");
        return false; // rfSubscriptionがnull
    }

    this.rf_deleteLocalAuthKey();

    try{
        let auth = btoa(
            String.fromCharCode.apply(
                null,
                new Uint8Array(rfSubscription.getKey("auth"))
            ))
            .replace(/\+/g, "-")
            .replace(/\//g, "_");
        let rfAuthKey;
        const apiResponse = await fetch((rfApiDomain + "/v1/devices/" + auth + "/authentication-tokens"), {
            method: "POST",
            mode:"cors",
            headers: {
                "X-API-Version": "2017-04-01",
                "X-Service-Key": rfServiceKey
            },
            body:{},
        });

        if(apiResponse.status == 200){
            rfAuthKey = JSON.parse(await apiResponse.text()).id_token;
            if(rfAuthKey == "undefined"){
                console.log("rfAuthkey parse error");
                return false;
            }
            // ローカルストレージに保存
            localStorage.setItem("rfAuthKey", rfAuthKey);
            return true;    // キー保存成功
        }else{
            const errJson = await apiResponse.json();
            // キー取得失敗
            console.log("status:" + apiResponse.status + " msg:" + errJson.message);
            if(apiResponse.status == 404 && errJson.code == 3){
                if(await rf_activateDevice(rfSubscription)){
                    return await rf_createAuthKey();
                }else{
                    return false;
                }
            }
            return false;
        }

    }catch(e){
        console.log(e);
        throw e;
    }
}

/**
 * 認証キーをローカルストレージから削除します。
 * Webプッシュの購読を解除する際に呼びます。
 */
function rf_deleteLocalAuthKey() {
    localStorage.removeItem("rfAuthKey");
}

/**
 * セグメント情報をRichFlyerサーバーに登録します。
 * @param {Object.<string, string>} segments セグメント情報 - ex. {"hobby":"game", "age":"young"}
 * @param {boolean} 結果
 */
async function rf_updateSegment(segments) {
    // ローカルストレージからauthKeyを取得する
    let authKey = localStorage.getItem("rfAuthKey");
    if(!authKey){
        //再取得
        if(await rf_createAuthKey()){
            authKey = localStorage.getItem("rfAuthKey");
            if(!authKey){
                console.log("error:cant get the rfAuthKey");
                return false;
            }
        }else{
            console.log("can't Make rfAuthKey");
            return false;
        }
    }

    if(!rfSubscription){
        console.log("rfSubscription undefined");
        return false;
    }

    try{
        let auth = btoa(
            String.fromCharCode.apply(
                null,
                new Uint8Array(rfSubscription.getKey("auth"))
            ))
            .replace(/\+/g, "-")
            .replace(/\//g, "_");
        // セグメント登録
        const apiResponse = await fetch((rfApiDomain + "/v1/devices/" + auth + "/segments"), {
            method: "PUT",
            mode:"cors",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json;charset=UTF-8",
                "Authorization": "Bearer " + authKey,
                "X-API-Version": "2017-04-01",
                "X-Service-Key": rfServiceKey
            },
            body: JSON.stringify({
                segments:segments
            }),
        });

        if(apiResponse.status == 200){
            return true;
        }else{
            // authキーの期限切れの場合はsegment登録APIから401が返る
            if(apiResponse.status == 401){
                //再取得
                if(await rf_createAuthKey()){
                    //segment登録の再実行
                    return await rf_updateSegment(segments);
                }
            }else{
                const errJson = await apiResponse.json();
                console.log("status:" + apiResponse.status + " msg:" + errJson.message);
                return false;
            }
        }

    }catch(e) {
        console.log(e);
        return false;
    }

}

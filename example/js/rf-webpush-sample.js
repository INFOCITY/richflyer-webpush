/**
 * rf-webpush-sample.js
 * RichFlyerで配信したWebプッシュを受信できるように定義した関数のサンプルです。
 *
 * rf-function.jsで定義してある関数(rf_***)を適切な場所で呼ぶことでRichFlyerから
 * Webプッシュ通知を受信できるようになります。
 * 当ファイルは必要に応じて編集が可能ですが、
 * お客様で編集した場合の動作の保証はできかねますのでご了承ください
 * Copyright © 2019年 INFOCITY,Inc. All rights reserved.
 */

/**
 * Webプッシュが許可されている時に実行する処理を記述します。
 * 例：
 * ・Webプッシュ通知を受ける入り口としてページ内に用意したボタンを非活性化する
 * ・セグメントを登録する
 * ※本サンプルの場合、index-sample.html表示時にgetSubscription()から毎回実行されるので注意してください。
 */
function enablePushRequest() {
}

/**
 * Webプッシュが許可されていない時に実行する処理を記述します。
 * 例：
 * ・Webプッシュ通知を受ける入り口としてページ内に用意したボタンを活性化する
 * ※本サンプルの場合、index-sample.html表示時にgetSubscription()から毎回実行されるので注意してください。
 */
function disablePushRequest() {
}

/**
 * requestPushSubscription()のWebプッシュ購読処理（subscribe）でエラーが発生した場合に呼ばれます。
 * 購読に失敗した際に必要な場合は処理を記述します。
 * @param {Error} err エラー情報
 */
function errorSubscription(err) {

}

/**
 * 購読情報を受け取り、同情報に基づき処理を実行します。
 * @param {PushSubscription} sub Webプッシュ通知の購読情報
 */
function setSubscription(sub) {
    if (sub) {
        // rf-function.jsの関数を呼ぶ前に必ず実行します。
        rf_setSubscription(sub); // この処理は必須
        enablePushRequest();
    } else {
        disablePushRequest();
    }
}

/**
 * Webプッシュの購読処理を実行します。
 * @param {ServiceWorkerRegistration} registration ServiceWorkerの登録情報
 * @return {boolean} 結果
 */
async function requestPushSubscription(registration) {
    const pKey = await rf_getServerPublicKey();

    // subscribe(通知の許可)処理
    const opt = {
        userVisibleOnly: true,
        applicationServerKey: decodeBase64URL(pKey),
    };
    return registration.pushManager
        .subscribe(opt)
        .then(async function(sub){
            await rf_activateDevice(sub);
            setSubscription(sub);
        }, errorSubscription);
}

/**
 * Webプッシュ機能へのアクセスパーミッションを有しているかチェックし、
 * 有している場合は、購読処理のリクエストを実行します。
 * @param {PermissionStatus} evt パーミッション情報
 */
function checkPushPermissionAndSubscribe(evt) {
    const state = evt.state || evt.status;
    if (state !== "denied")
        navigator.serviceWorker.ready.then(requestPushSubscription);
}

/**
 * Webプッシュ通知の許可の確認を行います。
 * ユーザに許可確認を表示したいタイミングで呼びます。
 * 例：
 * ページにボタンを配置してボタンをクリックした時
 * 指定のページ読み込みが完了した時
 * ※この関数は、変更を加えずに使用することをお勧めします。
 */
function requestNotificationPermission() {
    Notification.requestPermission(function(permission) {
        if (permission !== "denied") {
            if ("permissions" in navigator)
                navigator.permissions
                    .query({ name: "push", userVisibleOnly: true })
                    .then(checkPushPermissionAndSubscribe);
            else if (Notification.permission !== "denied") {
                navigator.serviceWorker.ready.then(requestPushSubscription);
            }
        }
    });
}

/**
 * Webプッッシュの購読を解除します。
 */
function unsubscribe() {
    if (rfSubscription) {
        rfSubscription.unsubscribe();
        rfSubscription = null;
        rf_deleteLocalAuthKey();
    }
}

/**
 * セグメントを登録します。
 */
function registSegments() {
  var segments = { hobby: "game", age:"young"};
  rf_updateSegment(segments);
}

/**
 * 購読情報を取得してsetSubscription()に渡します
 * @param {ServiceWorkerRegistration} registration Service Workerの登録情報
 */
function getSubscription(registration) {
    if ("pushManager" in registration) {
        registration.pushManager.getSubscription().then(setSubscription);
    }
}

function main() {
    if ("serviceWorker" in navigator) {
        navigator.serviceWorker.ready.then(getSubscription);
        navigator.serviceWorker.register("rf-serviceworker.js");
    } else {
    }
}

/**
 * index.html等から呼び出され初期化処理を実行します。
 * @param {string} skey RichFlyerで発行されるSDK実行キー
 * @param {string} sdomain プッシュ通知を許可するウェブサイトのドメイン
 */
function rfinit(skey, sdomain) {
     rf_init(skey, sdomain);
    window.addEventListener("load", main, false);
}

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
 * index.html等から呼び出されWebプッシュ通知の許可確認をし、登録処理を行います。
 * @param {string} skey RichFlyerで発行されるSDK実行キー
 * @param {string} sdomain プッシュ通知を許可するウェブサイトのドメイン
 * @param {string} websitePushId Safariプッシュで作成する証明書に指定したWebsite Push ID
 */
function initialize(skey, sdomain, websitePushId = "") {
     rf_init(
      skey,
      sdomain,
      websitePushId,
      safariCallbackFunc).then((result) => {
        console.log(result);
      }).catch((error) => {
        console.log(error);
      });
}

/**
 * Safariプッシュ通知登録が許可もしくは拒否された場合にrf_functionから呼び出される関数を定義します。
 * @param {string} permission rf_functionで呼び出される際に通知の登録状態が引数に渡されます。（許可:granted,拒否:denied）
 */
 function safariCallbackFunc(permission) {
  if (permission === "denied") {
      //通知登録が拒否された場合の処理
  }
  if (permission === "granted") {
      //通知登録が許可された場合の処理
  }
}

/**
 * Webプッッシュの購読を解除します。
 */
function unsubscribe() {
    rf_unsubscribe().then((result) => {
      console.log(result);
    }).catch((error) => {
      console.log(error);
    });
}

/**
 * セグメントを登録します。
 */
function registSegments(rfServiceKey, websitePushId) {

  var stringSegments = { hobby: "game", category: "young"};
  var numberSegments = { age: 30, launchCount: 10};
  var booleanSegments = { registered: true};
  var dateSegments = { registeredDate: new Date()};

  rf_updateSegments(stringSegments, numberSegments, booleanSegments, dateSegments,
    rfServiceKey, websitePushId).then((result) => {
      console.log(result);
    }).catch((error) => {
      console.log(error);
    });
}

/**
 * rf-function.js
 * Version 2.2.3
 * RichFlyerの機能を使用するための関数群です。
 *
 * 当ファイルは編集して利用しないでください。
 * お客様で編集した場合の動作の保証はできかねますのでご了承ください
 * Copyright © 2022年 INFOCITY,Inc. All rights reserved.
 */

const rfApiDomain = "https://api.richflyer.net";

//Safariプッシュの通知登録が完了した際に呼ばれる関数
let safariCallback;

/**
 * Webプッシュ通知登録処理を実行します
 * @param {string} rfServiceKey RichFlyerで発行されるSDK実行キー
 * @param {string} domain プッシュ通知を許可するウェブサイトのドメイン
 * @param {string} websitePushId Safariプッシュで作成する証明書に指定したWebsite Push ID
 * @param {function} safariCallbackFunc Safariプッシュ通知の登録が完了した際に呼び出されるコールバック関数
 * @return {string} 標準Webpush通知登録のみ登録結果を返す（成功/granted、拒否/denied）
 */
async function rf_init(
  rfServiceKey,
  domain,
  websitePushId,
  safariCallbackFunc
) {
  if ("PushManager" in window) {
    const serviceWorkerRegistration = await rf_registerServiceWorker();

    //標準WebPush処理
    const permission = await rf_requestPermission();

    if (permission === "denied") {
      return "denied";
    }

    if (permission === "granted") {
      try {
        const subscription = await rf_requestPushSubscription(
          serviceWorkerRegistration
        );

        const activateDevice = await rf_activateDevice(
          subscription,
          rfServiceKey,
          domain
        );
        if (!activateDevice) {
          //デバイス登録失敗の際はerrorを返す
          throw new Error("Activate Device failed.");
        }

        return "granted";
      } catch (error) {
        throw error;
      }
    }
  } else {
    safariCallback = safariCallbackFunc;
    //SafariPush処理
    if ("safari" in window && "pushNotification" in window.safari) {
      try {
        // ブラウザから通知の許可状況を取得します
        var permissionData =
          window.safari.pushNotification.permission(websitePushId);

        checkSafariRemotePermission(permissionData, websitePushId);
      } catch (error) {
        throw error;
      }
    }
  }
}

/**
 * ServiceWorkerの登録処理を行います。
 * @return {ServiceWorkerRegistration} ServiceWorkerの登録情報
 */
async function rf_registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    return navigator.serviceWorker.register(
      window.rfSetting
        ? window.rfSetting.serviceworkerPath
        : "rf-serviceworker.js"
    );
  }
}

/**
 * 標準Webpushの購読情報を取得する処理
 * セグメント登録時や通知解除で必要になる
 * @return {PushSubscription} ブラウザから取得したwebプッシュの通知購読情報
 */
async function getSubscription() {
  //WordPressプラグインの場合はスコープを指定する
  const registration = await navigator.serviceWorker.getRegistration(
    window.rfSetting ? window.rfSetting.serviceworkerPath : ""
  );
  const subscription = await registration.pushManager.getSubscription();
  return subscription;
}

/**
 * Webプッシュ通知の許可の確認を行います。
 * ユーザに許可確認を表示したいタイミングで呼びます。
 * Safariの場合、明示的なユーザージェスチャ（例:ボタンのクリック操作）がないとこの関数を呼び出してもエラーになります。
 * @return {Promise} ユーザーの操作に合わせた文字列が返されます。
 */
async function rf_requestPermission() {
  return await Notification.requestPermission();
}

/**
 * Webプッシュの購読処理を実行します。
 * @param {ServiceWorkerRegistration} registration ServiceWorkerの登録情報
 * @return {PushSubscription} Webプッシュ通知の購読情報
 */
async function rf_requestPushSubscription(registration) {
  const pKey = await rf_getServerPublicKey();

  const opt = {
    userVisibleOnly: true,
    applicationServerKey: decodeBase64URL(pKey),
  };
  return registration.pushManager.subscribe(opt);
}

/**
 * Webプッシュの購読処理を解除します。
 * @return {boolean} 通知登録解除処理が成功したかどうか（成功/true、失敗/false）
 */
async function rf_unsubscribe() {
  try {
    const rfSubscription = await getSubscription();
    if (rfSubscription) {
      await rfSubscription.unsubscribe();
      rf_deleteLocalAuthKey();
      return true;
    }
    return false;
  } catch (error) {
    throw error;
  }
}

/**
 * 購読情報を受け取り、同情報に基づき処理を実行します。
 * appleのリファレンスコードです。window.safari.pushNotification.permission([websitePushId])と合わせて使用してください
 * @param {any} permissionData Webプッシュ通知の購読情報
 * @param {string} websitePushId Safariプッシュで作成する証明書に指定したWebsite Push ID
 */
var checkSafariRemotePermission = function (permissionData, websitePushId) {
  if (permissionData.permission === "default") {
    // ブラウザ側に拒否も許可も記録されていない場合はユーザーに確認します
    window.safari.pushNotification.requestPermission(
      rfApiDomain,
      websitePushId,
      {},
      checkSafariRemotePermission
    );
  } else {
    // 通知登録処理の結果を渡す
    safariCallback(permissionData.permission);
  }
};

/**
 * RichFlyerサーバーに通知を受け取るブラウザを登録します。
 * @param {PushSubscription} sub Webプッシュ購読情報
 * @param {string} rfServiceKey RichFlyerで発行されるSDK実行キー
 * @param {string} rfUserDomain プッシュ通知を許可するウェブサイトのドメイン
 */
async function rf_activateDevice(sub, rfServiceKey, rfUserDomain) {
  //デバイス登録API_URL
  let setDeviceAPIURL = `${rfApiDomain}/v1/devices/webpush`;

  try {
    const endpoint = sub.endpoint;
    const p256dh = btoa(
      String.fromCharCode.apply(null, new Uint8Array(sub.getKey("p256dh")))
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const auth = rf_createDeviceId(sub);

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

    if (apiResponse.status == 200) {
      // 成功の場合は200しか返さないので200で判定
      return true; // デバイス登録成功
    } else {
      const errJson = await apiResponse.json();
      console.log("status:" + apiResponse.status + " msg:" + errJson.message);
      return false; // デバイス登録失敗(殆どの場合はデバイス用実行キーの入力ミス)
    }
  } catch (e) {
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
  let appServerPublicKeyURL = `${rfApiDomain}/v1/webpush/key`;
  const apiResponse = await fetch(appServerPublicKeyURL);
  return await apiResponse.text();
}

/**
 * APIリクエストのパスに指定するDeviceIdを生成します。
 * @param {PushSubscription} rfSubscription ブラウザから取得したwebプッシュの通知購読情報
 * @returns {string} APIリクエストのパスに指定するDeviceId
 */
function rf_createDeviceId(rfSubscription) {
  const auth = btoa(
    String.fromCharCode.apply(
      null,
      new Uint8Array(rfSubscription.getKey("auth"))
    )
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return auth;
}

/**
 * 認証トークンを取得します。
 * 認証トークンはローカルストレージで保持されRichFlyer APIで使用されます。
 * 認証トークンの有効期限は60分です。
 * @param {PushSubscription} rfSubscription ブラウザから取得したwebプッシュの通知購読情報
 * @param {string} rfServiceKey RichFlyerで発行されるSDK実行キー
 * @return {boolean} 結果
 */
async function rf_createAuthKey(rfSubscription, rfServiceKey) {
  if (!rfSubscription) {
    console.log("rfSubscription undefined");
    return false; // rfSubscriptionがnull
  }

  this.rf_deleteLocalAuthKey();

  try {
    const auth = rf_createDeviceId(rfSubscription);

    let rfAuthKey;
    const apiResponse = await fetch(
      `${rfApiDomain}/v1/devices/${auth}/authentication-tokens`,
      {
        method: "POST",
        mode: "cors",
        headers: {
          "X-API-Version": "2017-04-01",
          "X-Service-Key": rfServiceKey,
        },
        body: {},
      }
    );

    if (apiResponse.status == 200) {
      rfAuthKey = JSON.parse(await apiResponse.text()).id_token;
      if (rfAuthKey == "undefined") {
        console.log("rfAuthkey parse error");
        return false;
      }
      // ローカルストレージに保存
      localStorage.setItem("rfAuthKey", rfAuthKey);
      return true; // トークン保存成功
    } else {
      const errJson = await apiResponse.json();
      // キー取得失敗
      console.log("status:" + apiResponse.status + " msg:" + errJson.message);
      if (apiResponse.status == 404 && errJson.code == 3) {
        if (await rf_activateDevice(rfSubscription)) {
          return await rf_createAuthKey();
        } else {
          return false;
        }
      }
      return false;
    }
  } catch (e) {
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

function convertAvailableSegments(segments) {
  var convertedSegments = new Object();
  Object.keys(segments).forEach((key) => {
    const value = segments[key];

    if (typeof value == "string" || value instanceof String) {
      convertedSegments[key] = value;
    } else if (typeof value == "number" || value instanceof Number) {
      convertedSegments[key] = value.toString();
    } else if (typeof value == "boolean" || value instanceof Boolean) {
      convertedSegments[key] = value.toString();
    } else if (value instanceof Date) {
      const unixTime = Math.floor(segments[key].getTime() / 1000);
      convertedSegments[key] = unixTime.toString();
    }
  });

  return convertedSegments;
}

/**
 * セグメント情報をRichFlyerサーバーに登録します。
 * @param {Object.<string, string>} stringSegments 文字列セグメント情報 - ex. {hobby:"game", category:"young"}
 * @param {Object.<string, number>} numberSegments 数値セグメント情報 - ex. {count:10, age:30}
 * @param {Object.<string, boolean>} booleanSegments 真偽値セグメント情報 - ex. {registered:true, purchased:false}
 * @param {Object.<string, Date>} dateSegments 日時セグメント情報 - ex. {date: new Date()}
 * @param {string} rfServiceKey RichFlyerで発行されるSDK実行キー
 * @param {string} websitePushId Safariプッシュで作成する証明書に指定したWebsite Push ID
 * @return {boolean} セグメント登録処理の結果（成功/true、失敗/Errorオブジェクト）
 */
async function rf_updateSegments(
  stringSegments,
  numberSegments,
  booleanSegments,
  dateSegments,
  rfServiceKey,
  websitePushId
) {
  const segments = Object.assign(
    stringSegments,
    numberSegments,
    booleanSegments,
    dateSegments
  );
  await rf_updateSegment(segments, rfServiceKey, websitePushId);
}

/**
 * 値が文字列のセグメント情報をRichFlyerサーバーに登録します。
 * @param {Object.<string, string>} stringSegments 文字列セグメント情報 - ex. {hobby:"game", category:"young"}
 * @param {string} rfServiceKey RichFlyerで発行されるSDK実行キー
 * @param {string} websitePushId Safariプッシュで作成する証明書に指定したWebsite Push ID
 * @return {boolean} セグメント登録処理の結果（成功/true、失敗/Errorオブジェクト）
 */
async function rf_updateStringSegments(segments, rfServiceKey, websitePushId) {
  await rf_updateSegment(segments, rfServiceKey, websitePushId);
}

/**
 * 値が数値のセグメント情報をRichFlyerサーバーに登録します。
 * @param {Object.<string, number>} numberSegments 数値セグメント情報 - ex. {count:10, age:30}
 * @param {string} rfServiceKey RichFlyerで発行されるSDK実行キー
 * @param {string} websitePushId Safariプッシュで作成する証明書に指定したWebsite Push ID
 * @return {boolean} セグメント登録処理の結果（成功/true、失敗/Errorオブジェクト）
 */
async function rf_updateNumberSegments(segments, rfServiceKey, websitePushId) {
  await rf_updateSegment(segments, rfServiceKey, websitePushId);
}

/**
 * あたいが真偽値のセグメント情報をRichFlyerサーバーに登録します。
 * @param {Object.<string, boolean>} booleanSegments 真偽値セグメント情報 - ex. {registered:true, purchased:false}
 * @param {string} rfServiceKey RichFlyerで発行されるSDK実行キー
 * @param {string} websitePushId Safariプッシュで作成する証明書に指定したWebsite Push ID
 * @return {boolean} セグメント登録処理の結果（成功/true、失敗/Errorオブジェクト）
 */
async function rf_updateBooleanSegments(segments, rfServiceKey, websitePushId) {
  await rf_updateSegment(segments, rfServiceKey, websitePushId);
}

/**
 * 値が日時のセグメント情報をRichFlyerサーバーに登録します。
 * @param {Object.<string, Date>} dateSegments 日時セグメント情報 - ex. {date: new Date()}
 * @param {string} rfServiceKey RichFlyerで発行されるSDK実行キー
 * @param {string} websitePushId Safariプッシュで作成する証明書に指定したWebsite Push ID
 * @return {boolean} セグメント登録処理の結果（成功/true、失敗/Errorオブジェクト）
 */
async function rf_updateDateSegments(segments, rfServiceKey, websitePushId) {
  await rf_updateSegment(segments, rfServiceKey, websitePushId);
}

/**
 * Bearer認証トークンを取得します。
 * @param {PushSubscription} rfSubscription ブラウザから取得したwebプッシュの通知購読情報
 * @param {string} rfServiceKey RichFlyerで発行されるSDK実行キー
 * @returns {string} Bearer認証トークン
 */
async function rf_getAuthKey(rfSubscription, rfServiceKey) {
  // ローカルストレージからauthKeyを取得する
  let authKey = localStorage.getItem("rfAuthKey");
  if (authKey) {
    return authKey;
  }

  //ローカルストレージにauthKeyがない場合は再取得
  if (await rf_createAuthKey(rfSubscription, rfServiceKey)) {
    authKey = localStorage.getItem("rfAuthKey");
    if (!authKey) {
      console.log("error:cant get the rfAuthKey");
      return;
    }
    return authKey;
  } else {
    console.log("can't Make rfAuthKey");
    return;
  }
}

/**
 * セグメント情報をRichFlyerサーバーに登録します。
 * @param {Object.<string, string>} segments セグメント情報 - ex. {"hobby":"game", "age":"young"}
 * @param {string} rfServiceKey RichFlyerで発行されるSDK実行キー
 * @param {string} websitePushId Safariプッシュで作成する証明書に指定したWebsite Push ID
 * @return {boolean} セグメント登録処理の結果（成功/true、失敗/Errorオブジェクト）
 */
async function rf_updateSegment(segments, rfServiceKey, websitePushId) {
  const sendSegments = convertAvailableSegments(segments);
  if ("PushManager" in window) {
    //標準WebPushのセグメント登録処理
    if (await rf_updateSegmentWebpush(sendSegments, rfServiceKey)) {
      return true;
    } else {
      throw new Error("Update Segment failed.");
    }
  } else {
    //SafariPushのセグメント登録処理
    const rfSafariRemotePermission = await rfSafari_getRemotePermission(
      websitePushId
    );
    if (
      await rfSafari_updateSegment(
        sendSegments,
        rfServiceKey,
        rfSafariRemotePermission
      )
    ) {
      return true;
    } else {
      throw new Error("Update Segment failed.");
    }
  }
}

/**
 * セグメント情報をRichFlyerサーバーに登録します。(WebPush)
 * @param {Object.<string, string>} segments セグメント情報 - ex. {"hobby":"game", "age":"young"}
 * @param {string} rfServiceKey RichFlyerで発行されるSDK実行キー
 * @return {boolean} 結果
 */
async function rf_updateSegmentWebpush(segments, rfServiceKey) {
  const rfSubscription = await getSubscription();

  const authKey = await rf_getAuthKey(rfSubscription, rfServiceKey);
  if (!authKey) {
    return false;
  }

  if (!rfSubscription) {
    console.log("rfSubscription undefined");
    return false;
  }

  try {
    const auth = rf_createDeviceId(rfSubscription);

    // セグメント登録
    const apiResponse = await fetch(
      `${rfApiDomain}/v1/devices/${auth}/segments`,
      {
        method: "PUT",
        mode: "cors",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json;charset=UTF-8",
          Authorization: "Bearer " + authKey,
          "X-API-Version": "2017-04-01",
          "X-Service-Key": rfServiceKey,
        },
        body: JSON.stringify({
          segments: segments,
        }),
      }
    );

    if (apiResponse.status == 200) {
      return true;
    } else {
      // authキーの期限切れの場合はsegment登録APIから401が返る
      if (apiResponse.status == 401) {
        //再取得
        if (await rf_createAuthKey(rfSubscription, rfServiceKey)) {
          //segment登録の再実行
          return await rf_updateSegment(segments, rfServiceKey);
        }
      } else {
        const errJson = await apiResponse.json();
        console.log("status:" + apiResponse.status + " msg:" + errJson.message);
        return false;
      }
    }
  } catch (e) {
    console.log(e);
    return false;
  }
}

/**
 * Website Push Idを指定して、設定されているsafariプッシュの購読情報を取得します。
 * @param {string} websitePushId Safariプッシュで作成する証明書に指定したWebsite Push ID
 * @return {Object} 設定されているsafariプッシュの購読情報
 */
async function rfSafari_getRemotePermission(websitePushId) {
  const rfSafariRemotePermission =
    await window.safari.pushNotification.permission(websitePushId);
  return rfSafariRemotePermission;
}

/**
 * サーバーに保存してあるデバイスIDを取得します
 * デバイスIDは認証キーを取得するための情報及びセグメント登録時の端末識別情報として使用します
 * @param {string} rfServiceKey RichFlyerで発行されるSDK実行キー
 * @param {remotePermission} rfSafariRemotePermission ブラウザから取得したsafariプッシュの購読情報
 * @return {string} デバイスID
 */
async function rfSafari_getDeviceId(rfServiceKey, rfSafariRemotePermission) {
  if (!rfSafariRemotePermission) {
    console.log("rfSafariRemotePermission undefined");
    return false;
  }

  try {
    const deviceToken = rfSafariRemotePermission.deviceToken;
    const apiResponse = await fetch(
      `${rfApiDomain}/v1/safari/devices/${deviceToken}/deviceID/`,
      {
        method: "GET",
        mode: "cors",
        headers: {
          "X-API-Version": "2017-04-01",
          "X-Service-Key": rfServiceKey,
        },
      }
    );

    if (apiResponse.status == 200) {
      // 成功の場合は200しか返さないので200で判定
      const rfSafariDeviceId = JSON.parse(await apiResponse.text()).device_id;
      if (rfSafariDeviceId == "undefined") {
        console.log("rfSafariDeviceId parse error");
        return null;
      }
      return rfSafariDeviceId;
    } else {
      // 200以外のコードは処理続行不可能。safariからtokenが取得出来ないケース？"許可"になったままtokenが取れなくなってるのであればpushPackageが取得できなくなっている可能性：要問合せ
      return null;
    }
  } catch (e) {
    console.log(e);
    throw e;
  }
}

/**
 * 認証キーを取得します。
 * 認証キーはローカルストレージで保持されRichFlyer APIで使用されます。
 * @param {string} rfServiceKey RichFlyerで発行されるSDK実行キー
 * @param {remotePermission} rfSafariRemotePermission ブラウザから取得したsafariプッシュの購読情報
 * @return {boolean} 結果
 */
async function rfSafari_createAuthKey(rfServiceKey, rfSafariRemotePermission) {
  if (!rfSafariRemotePermission) {
    console.log("rfSafariRemotePermission undefined");
    return false; // safariのpermissionがnull
  }

  this.rfSafari_deleteLocalAuthKey(); // ローカルストレージのデータを一回消す。なくても構わない(初回等で絶対にないケースもある)のでエラー処理しない

  try {
    let deviceId = await this.rfSafari_getDeviceId(
      rfServiceKey,
      rfSafariRemotePermission
    );
    let rfAuthKey;
    const apiResponse = await fetch(
      `${rfApiDomain}/v1/devices/${deviceId}/authentication-tokens`,
      {
        method: "POST",
        mode: "cors",
        headers: {
          "X-API-Version": "2017-04-01",
          "X-Service-Key": rfServiceKey,
        },
        body: {},
      }
    );

    if (apiResponse.status == 200) {
      // 成功の場合は200しか返さないので200で判定
      rfAuthKey = JSON.parse(await apiResponse.text()).id_token;
      if (rfAuthKey == "undefined") {
        console.log("rfAuthkey parse error");
        return false;
      }
      // ローカルストレージに保存
      localStorage.setItem("rfAuthKey", rfAuthKey);
      return true; // キー保存成功
    } else {
      const errJson = await apiResponse.json();
      // キー取得失敗
      console.log("status:" + apiResponse.status + " msg:" + errJson.message);
      if (apiResponse.status == 404 && errJson.code == 3) {
        // safariの場合,構造的にこの時点でcode3が返ってくる場合はユーザーが意図してブラウザ情報を歪めている可能性が高いためあえてケアしない
        console.log("rfAuthKey undefined");
      }
      return false;
    }
  } catch (e) {
    console.log(e);
    throw e;
  }
}

/**
 * 認証キーをローカルストレージから削除します。
 * Webプッシュの購読を解除する際に呼びます。
 */
function rfSafari_deleteLocalAuthKey() {
  // ローカルストレージから削除
  localStorage.removeItem("rfAuthKey");
}

/**
 * セグメント情報をRichFlyerサーバーに登録します。(SafariPush)
 * @param {Object.<string, string>} segments セグメント情報 - ex. {"hobby":"game", "age":"young"}
 * @param {string} rfServiceKey RichFlyerで発行されるSDK実行キー
 * @param {remotePermission} rfSafariRemotePermission ブラウザから取得したsafariプッシュの購読情報
 * @return {boolean} 結果
 */
async function rfSafari_updateSegment(
  segments,
  rfServiceKey,
  rfSafariRemotePermission
) {
  // ローカルストレージからauthKeyを取得する
  let authKey = localStorage.getItem("rfAuthKey");
  if (!authKey) {
    //再取得
    if (await rfSafari_createAuthKey(rfServiceKey, rfSafariRemotePermission)) {
      authKey = localStorage.getItem("rfAuthKey");
      if (!authKey) {
        console.log("error:cant get the rfAuthKey");
        return false;
      }
    } else {
      console.log("can't Make rfAuthKey");
      return false;
    }
  }

  try {
    let deviceId = await this.rfSafari_getDeviceId(
      rfServiceKey,
      rfSafariRemotePermission
    );
    // セグメント登録
    const apiResponse = await fetch(
      `${rfApiDomain}/v1/devices/${deviceId}/segments`,
      {
        method: "PUT",
        mode: "cors",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json;charset=UTF-8",
          Authorization: "Bearer " + authKey,
          "X-API-Version": "2017-04-01",
          "X-Service-Key": rfServiceKey,
        },
        body: JSON.stringify({
          segments: segments,
        }),
      }
    );

    if (apiResponse.status == 200) {
      return true;
    } else {
      // authキーの期限切れの場合はsegment登録APIから401が返る
      if (apiResponse.status == 401) {
        //再取得
        if (
          await rfSafari_createAuthKey(rfServiceKey, rfSafariRemotePermission)
        ) {
          //segment登録の再実行
          return await rfSafari_updateSegment(
            segments,
            rfServiceKey,
            websitePushId
          );
        }
      } else {
        const errJson = await apiResponse.json();
        console.log("status:" + apiResponse.status + " msg:" + errJson.message);
        return false;
      }
    }
  } catch (e) {
    console.log(e);
    return false;
  }
}

/**
 * 効果測定ログの登録リクエストをRichFlyerサーバーに送信します。(標準Webプッシュのみ)
 * @param {*} rfServiceKey RichFlyerで発行されるSDK実行キー
 * @param {*} notificationId プッシュ通知を受信した際に保存されている通知ID
 * @param {PushSubscription} rfSubscription ブラウザから取得したwebプッシュの通知購読情報
 * @returns
 */
async function rf_requestRegisterEventLog(rfServiceKey, notificationId, rfSubscription, retry = 3) {

  const authKey = await rf_getAuthKey(rfSubscription, rfServiceKey);
  if (!authKey) {
    return false;
  }

  if (!rfSubscription) {
    console.log("rfSubscription is undefined");
    return false;
  }

  try {
    const auth = await rf_createDeviceId(rfSubscription);

    // 効果測定ログ登録
    const currentTime = new Date().getTime();
    const timestamp = Math.floor(currentTime / 1000);
    const apiResponse = await fetch(
      `${rfApiDomain}/v1/devices/${auth}/event-logs-webpush`,
      {
        method: "POST",
        mode: "cors",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json;charset=UTF-8",
          Authorization: "Bearer " + authKey,
          "X-API-Version": "2017-04-01",
          "X-Service-Key": rfServiceKey,
        },
        body: JSON.stringify({
          notification_id: notificationId,
          event_id: "richflyer_launch_app",
          event_time: timestamp,
        }),
      }
    );

    if (apiResponse.status == 200) {
      return true;
    } else {
      // authキーの期限切れの場合はevent_log登録APIから401が返る
      if (apiResponse.status == 401) {
        //再取得
        if (await rf_createAuthKey(rfSubscription, rfServiceKey)) {
          //event_log登録の再実行
          const leftRetry = retry - 1;
          return await rf_requestRegisterEventLog(rfServiceKey, notificationId, rfSubscription, leftRetry);
        }
      } else {
        const errJson = await apiResponse.json();
        console.log("status:" + apiResponse.status + " msg:" + errJson.message);
        return false;
      }
    }
  } catch (e) {
    console.log(e);
    return false;
  }
}

async function prepareEventLog() {
  const db = await openDatabase();
  const rfObject = await getStoredRFObject(db);

  if (rfObject) {
    const isSentLog = rfObject.is_sent_event_log;
    if (isSentLog==0) {
      return rfObject.notification_id;
    }
  }
  return null;
}

/**
 * indexedDBの保存してあるイベントログ送信済みかどうかの値を更新します。
 * @param {string} notificationId プッシュ通知を受信した際に保存されている通知ID
 */
async function updateIsSentEventLog(notificationId) {
  const db = await openDatabase();
  const rfObject = await getStoredRFObject(db);
  if (rfObject) {
    rfObject.is_sent_event_log = 1;
    await updateStoredRFObject(db, rfObject);  
  }
}

/**
 * 効果測定ログをRichFlyerサーバーに登録します。(Webプッシュ)
 * @param {string} rfServiceKey RichFlyerで発行されるSDK実行キー
 */
async function rf_registerEventLog(rfServiceKey) {

  if (!("PushManager" in window)) {
    throw new Error("This environment is not support for registering event logs.");
  }
  
  const notificationId = await prepareEventLog();
  if (!notificationId) {
    throw new Error("Event log has already send.");
  }

  const rfSubscription = await getSubscription();    
  if (!await rf_requestRegisterEventLog(rfServiceKey, notificationId, rfSubscription)) {
    throw new Error("Register event log failed.");
  }

  await updateIsSentEventLog(notificationId);
  return true;    
}


/**
 * カスタム許可ダイアログを表示します。
 * @param {string} rfServiceKey RichFlyerで発行されるSDK実行キー
 * @param {string} domain プッシュ通知を許可するウェブサイトのドメイン
 * @param {string} websitePushId Safariプッシュで作成する証明書に指定したWebsite Push ID
 * @param {object} popupSettingValue カスタム許可ダイアログに表示するコンテンツ詳細
 * const popupSettingValue = {
    type: {string} 表示タイプ(normal || bar || center)
    message: {string} メッセージ
    img: {string} イメージファイル
    cancelButton: {string} 通知拒否ボタン名
    submitButton: {string} 通知許可ボタン名
  }
 */
async function rf_init_popup(rfServiceKey, domain, websitePushId, popupSettingValue) {
  if ("PushManager" in window) {
    const serviceWorkerRegistration = await rf_registerServiceWorker()
    const permission = await serviceWorkerRegistration.pushManager.permissionState({userVisibleOnly: true})
    if (permission !== "prompt") {
      return
    }
  } else if ("safari" in window && "pushNotification" in window.safari) {
    var permissionData =
      window.safari.pushNotification.permission(websitePushId)
    if (permissionData.permission !== "default") {
      return
    }
  }
  const popup = document.getElementById("popup")
  if (popup) {
    return
  }
  const type = popupSettingValue.type

  const popupDiv = document.createElement("div")
  popupDiv.id = "popup"
  popupDiv.className = `popup-${type}`

  const popupContent = document.createElement("div")
  popupContent.id = type === "center" ? "popup-center-content" : "popup-content"

  const iconImg = document.createElement("img")
  iconImg.src = popupSettingValue.img
  iconImg.id = type === "center" ? "icon-image" : "icon-image-small"

  const popupText = document.createElement("span")
  popupText.id = type === "center" ? "popup-text-center" : "popup-text"
  popupText.textContent = popupSettingValue.message

  const popupButtonContent = document.createElement("div")
  popupButtonContent.id = "popup-button-content"

  const popupButtonCancel = document.createElement("button")
  popupButtonCancel.id = "popup-button-cancel"
  popupButtonCancel.textContent = popupSettingValue.cancelButton
  popupButtonCancel.setAttribute("onclick", `rf_cancel("${type}")`)

  const popupButtonSubmit = document.createElement("button")
  popupButtonSubmit.id = "popup-button-submit"
  popupButtonSubmit.textContent = popupSettingValue.submitButton
  popupButtonSubmit.setAttribute("onclick", `rf_submit("${rfServiceKey}", "${domain}", "${websitePushId}", "${type}")`)

  popupContent.appendChild(iconImg)
  popupContent.appendChild(popupText)
  popupButtonContent.appendChild(popupButtonCancel)
  popupButtonContent.appendChild(popupButtonSubmit)
  popupDiv.appendChild(popupContent)
  popupDiv.appendChild(popupButtonContent)

  document.body.appendChild(popupDiv)
  if (type === "center") {
    const fullScreenContent = document.createElement("div")
    fullScreenContent.id = "fullscreen-content"
    fullScreenContent.className = "fullscreen-content-hidden"
    document.body.appendChild(fullScreenContent)
    setTimeout(() => {
      fullScreenContent.classList.add("fullscreen-content-show")
    }, 10);
    const iconInterval = setInterval(() => {
      if (iconImg.complete) {
        popupDiv.setAttribute("style", `top: calc(50vh - ${popupDiv.offsetHeight / 2}px)`)
        const height = iconImg.naturalHeight;
        const width = iconImg.naturalWidth;
        height < width ? iconImg.setAttribute("id", "icon-image-oblong") : null;
        clearInterval(iconInterval)
      }
    }, 50)
  } else {
    const iconInterval = setInterval(() => {
      if (iconImg.complete) {
        const height = iconImg.naturalHeight;
        const width = iconImg.naturalWidth;
        height > width
          ? null
          : iconImg.setAttribute("id", "icon-image-small-oblong");
        clearInterval(iconInterval)
      }
    }, 50)
  }
  
  setTimeout(() => {
    popupDiv.classList.add(`popup-${type}-show`);
  }, 10)
}

/**
 * Webプッシュ通知の登録を実行します。
 * @param {string} rfServiceKey RichFlyerで発行されるSDK実行キー
 * @param {string} domain プッシュ通知を許可するウェブサイトのドメイン
 * @param {string} websitePushId Safariプッシュで作成する証明書に指定したWebsite Push ID
 * @param {string} type ダイアログの表示タイプ
 */
async function rf_submit(rfServiceKey, domain, websitePushId, type) {
  const popupDiv = document.getElementById("popup")
  popupDiv.classList.remove(`popup-${type}-show`)
  if (type === "center") {
    const fullScreenContent = document.getElementById("fullscreen-content")
    fullScreenContent.classList.remove("fullscreen-content-show")
    setTimeout(() => {
      fullScreenContent.remove()
    }, 300)
  }
  if ("PushManager" in window) {
    // 通常Webプッシュ処理
    const serviceWorkerRegistration = await rf_registerServiceWorker();
  
    try {
      const subscription = await rf_requestPushSubscription(
        serviceWorkerRegistration
      );
  
      const activateDevice = await rf_activateDevice(
        subscription,
        rfServiceKey,
        domain
      );
      if (!activateDevice) {
        //デバイス登録失敗の際はerrorを返す
        throw new Error("Activate Device failed.");
      }
  
      setTimeout(() => {
        popupDiv.remove()    
        return "granted";
      }, 400)
    } catch (error) {
      popupDiv.classList.remove(`popup-${type}-show`)
      if (type === "center") {
        const fullScreenContent = document.getElementById("fullscreen-content")
        fullScreenContent.classList.remove("fullscreen-content-show")
        setTimeout(() => {
          fullScreenContent.remove()
        }, 300)
      }
      setTimeout(() => {
        popupDiv.remove()
        throw error;
      }, 400)
    }
  } else {
    safariCallback = safariCallbackFunc;
    //SafariPush処理
    if ("safari" in window && "pushNotification" in window.safari) {
      try {
        // ブラウザから通知の許可状況を取得します
        var permissionData =
          window.safari.pushNotification.permission(websitePushId);

        checkSafariRemotePermission(permissionData, websitePushId);
      } catch (error) {
        throw error;
      }
    }
  }
}

/**
 * Webプッシュ通知登録が拒否されダイアログを閉じます。
 * @param {*} type ダイアログの表示タイプ
 */
async function rf_cancel(type) {
  const popupDiv = document.getElementById("popup")
  popupDiv.classList.remove(`popup-${type}-show`)
  if (type === "center") {
    const fullScreenContent = document.getElementById("fullscreen-content")
    fullScreenContent.classList.remove("fullscreen-content-show")
    setTimeout(() => {
      fullScreenContent.remove()
    }, 300)
  }
  setTimeout(() => {
    popupDiv.remove()
  }, 400)
}


/**
 * 最後に取得したプッシュ通知の情報を取得します。
 * @return {object} プッシュ通知の情報
   const resultObject = {
      notificationId:        {string} 通知ID
      title:                 {string} タイトル
      body:                  {string} 本文
      extendedProperty:      {string} 拡張プロパティ
      isClickedNotification: {number} 1:通知をクリックした 0:通知をクリックしていない
      receivedDate:          {number} 受信日時(UnixTime
    }
 */
async function rf_getLastNotification() {
  return getLastRFNotification();
}

/**
 * 最後に取得したプッシュ通知の情報を削除します。
 * @return {boolean} 成否
 */
async function rf_clearLastNotification() {
  return clearLastRFNotification();
}

/**
 * 保存されている拡張プロパティを削除します。
 * @return {boolean} 成否
 */
async function rf_clearExtendedProperty() {
  return clearRFExtendedProperty();
}

/**
 * プッシュ通知通知をクリックしたか否かの記録を更新します。
 * @param {boolean} clicked true:クリックした false:クリックしていない
 * @return {boolean} 成否
 */
async function rf_updateClickNotificationStatus(clicked) {
  return updateRFClickNotificationStatus(clicked);
}

async function getLastRFNotification() {

  const db = await openDatabase();
  const rfObject = await getStoredRFObject(db);

  if (rfObject) {
    const resultObject = {
      notificationId: rfObject.notification_id,
      title: rfObject.title,
      body: rfObject.body,
      extendedProperty: rfObject.extended_property,
      isClickedNotification: rfObject.is_clicked_notification,
      receivedDate: rfObject.received_date
    };
    return resultObject;
  }
  return null;
}

async function clearLastRFNotification() {

  const db = await openDatabase();
  const rfObject = await getStoredRFObject(db);

  if (rfObject) {
    rfObject.notification_id = "";
    rfObject.title = "";
    rfObject.body = "";
    rfObject.extended_property = "";
    rfObject.is_clicked_notification = true;
    rfObject.received_date = 0;
    return await updateStoredRFObject(db, rfObject);
  } else {
    return false;
  }
}

async function clearRFExtendedProperty() {

  const db = await openDatabase();
  const rfObject = await getStoredRFObject(db);

  if (rfObject) {
    rfObject.extended_property = "";
    return await updateStoredRFObject(db, rfObject);
  } else {
    return false;
  }
}

async function updateRFClickNotificationStatus(clicked) {
  const db = await openDatabase();
  const rfObject = await getStoredRFObject(db);

  if (rfObject) {
    rfObject.is_clicked_notification = clicked ? 1 : 0;
    return await updateStoredRFObject(db, rfObject);
  } else {
    return false;
  }
}

// #region indexed DB
function openDatabase() {
  const promise = new Promise((resolve, reject) => {
    const db = indexedDB.open("richflyer_database", 1);
    db.onsuccess = (event) => resolve(event.target.result);
    db.onerror = (event) => reject();
    db.onupgradeneeded = (event) => onUpgradeDB(event.target.result);
  });

  return promise;
}

function onUpgradeDB(db) {
  const storeName = getRFObjectStoreName();
  if (!db.objectStoreNames.contains(storeName)) {
    db.createObjectStore(storeName, { keyPath: "name" });
  }

}

function getRFObjectStoreName() {
  return "notification";
}

function getStoredRFObjectName() {
  return "richflyer_notification";
}

async function getStoredRFObject(db) {
  return new Promise((resolve, reject) => {
    const storeName = getRFObjectStoreName();
    const storedObjectName = getStoredRFObjectName();

    const isExistobjectStore = db.objectStoreNames.contains(storeName);    
    if (!isExistobjectStore) {
      reject(null);
      return;
    }

    const transaction = db.transaction(storeName, "readonly");
    const objectStore = transaction.objectStore(storeName);
    const rfObject = objectStore.get(storedObjectName);
    rfObject.onsuccess = (event) => resolve(event.target.result);
    rfObject.onerror = reject;
  });
}

async function updateStoredRFObject(db, rfObject) {
  return new Promise((resolve, reject) => {
    const storeName = getRFObjectStoreName();

    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const result = store.put(rfObject);
    result.onsuccess = () => resolve(true);
    result.onerror = reject;
  });
}

// #endregion
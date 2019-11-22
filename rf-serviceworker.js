/**
 * rf-serviceworker.js
 * Webプッシュの表示等に関わるメソッド群です。
 *
 * 当ファイルは編集して利用しないでください。
 * お客様で編集した場合の動作の保証はできかねますのでご了承ください
 * Copyright © 2019年 INFOCITY,Inc. All rights reserved.
 */

/**
 * RichFlyerサーバより配信された通知を表示します。
 * 参照: https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification
 * @param {string} Title 通知のタイトル
 * @param {string} Icon 表示する画像のURL。RichFlyerの管理サイトで指定した画像。Webプッシュ用にリサイズされている。
 * @param {string} Body 通知の本文
 * @param {string} notification_id RichFlyerで割り当てられた通知ID
 * @param {string} url 一番目のアクションボタンに設定したURL
 * @param {string} click_action 拡張プロパティに設定した文字列
 * @return {Promise} 結果
 */
function showNotification({Title:title='',Icon:icon='',Body:body='(with empty payload)',notification_id:tag='',url:data=null,click_action:click_action=null}) {
    return self.registration.showNotification(title, {
        icon, // 画像のurl サイズは100px以下を推奨
        body,
        tag,
        data, // 通知に表示するurlです
        vibrate: [400, 100, 400], // モバイル端末の場合のバイブレーションの設定です
    });
}

/**
 * プッシュ通知を受信すると呼ばれます。
 * 受信した通知をshowNotificationに渡して表示処理を実行します。
 * @param {PushEvent} 受信したプッシュ通知のオブジェクト
 */
function receivePush(event) {
    //通知の表示を実行
    if (event.data && "showNotification" in self.registration) {
        event.waitUntil(showNotification(event.data.json()));
    }
}

/**
 * showNotificationによって表示された通知をクリックもしくはタップしたときに呼ばれます。
 * 一番目のアクションボタンに設定されたURLを開きます。
 * アクションボタンが設定されていない場合は何もしません。
 * @param {NotificationEvent} クリックした通知のオブジェクト
 */
function notificationClick(event) {
    event.notification.close();
    if (event.notification.data) {
        event.waitUntil(clients.openWindow(event.notification.data));
    }
}

self.addEventListener("push", receivePush, false);
self.addEventListener("notificationclick", notificationClick, false);

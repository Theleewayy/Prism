chrome.runtime.onMessage.addListener((msg, sender) => {

    if (msg.type === "scamWarning") {

        chrome.action.setBadgeText({
            text: "!"
        })

        chrome.action.setBadgeBackgroundColor({
            color: "red"
        })

    }

})
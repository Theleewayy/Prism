chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {

    let url = new URL(tabs[0].url)

    document.getElementById("site").innerText = url.hostname

})

document.getElementById("scan").addEventListener("click", () => {

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {

        chrome.tabs.sendMessage(tabs[0].id, {
            action: "scanCookies"
        })

    })

})

chrome.runtime.onMessage.addListener((msg) => {

    if (msg.type === "trackerCount") {

        document.getElementById("blocked").innerText = msg.count

    }

})
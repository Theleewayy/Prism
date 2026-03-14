function autoRejectCookies() {

    const rejectWords = [
        "reject",
        "reject all",
        "decline",
        "only necessary",
        "essential only"
    ]

    let buttons = document.querySelectorAll("button")

    buttons.forEach(btn => {

        let text = btn.innerText.toLowerCase()

        if (rejectWords.some(word => text.includes(word))) {

            console.log("PRISM rejecting cookies")

            btn.click()

        }

    })

}

setTimeout(autoRejectCookies, 2000)

function detectTrackers() {

    let trackers = [
        "doubleclick",
        "facebook",
        "google-analytics",
        "hotjar",
        "mixpanel"
    ]

    let count = 0

    trackers.forEach(t => {

        if (document.documentElement.innerHTML.includes(t)) {
            count++
        }

    })

    chrome.runtime.sendMessage({
        type: "trackerCount",
        count: count
    })

}

detectTrackers()
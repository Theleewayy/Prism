console.log("PRISM scanning page")

let text = document.body.innerText.toLowerCase()

let scamWords = [
    "urgent",
    "verify now",
    "suspended",
    "gift card",
    "police",
    "act immediately"
]

let found = scamWords.some(word => text.includes(word))

if (found) {

    chrome.runtime.sendMessage({
        type: "scamWarning"
    })

}
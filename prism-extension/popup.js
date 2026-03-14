chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {

    let url = new URL(tabs[0].url)
    let domain = url.hostname

    document.getElementById("site").innerText = domain

    generateScore(domain)

})

function generateScore(domain) {

    let score = 100
    let warnings = []

    if (domain.length > 25) {
        score -= 10
        warnings.push("Suspiciously long domain")
    }

    if (domain.includes("xn--")) {
        score -= 20
        warnings.push("Possible homograph attack")
    }

    if (domain.includes("-")) {
        score -= 5
    }

    updateUI(score, warnings)

}

function updateUI(score, warnings) {

    let scoreElement = document.getElementById("score")

    scoreElement.innerText = score

    if (score >= 80) {
        scoreElement.style.color = "lime"
    }

    else if (score >= 50) {
        scoreElement.style.color = "orange"
    }

    else {
        scoreElement.style.color = "red"
    }

    let warningList = document.getElementById("warnings")

    warnings.forEach(w => {
        let li = document.createElement("li")
        li.innerText = w
        warningList.appendChild(li)
    })

}
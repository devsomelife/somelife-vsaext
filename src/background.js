// Opens the options page from the toolbar icon.
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

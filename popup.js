document.getElementById('clearBtn').addEventListener('click', async () => {
    await chrome.storage.local.set({ nunus_viewed_articles: [] });
    const status = document.getElementById('status');
    status.textContent = 'History cleared!';
    setTimeout(() => { status.textContent = ''; }, 2000);
});

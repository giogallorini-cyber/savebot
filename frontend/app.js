const API_URL = 'https://savebot-m6e8.onrender.com';

let saves = [];
let currentFilter = 'all';

const savesContainer = document.getElementById('savesContainer');
const filterButtons = document.querySelectorAll('.filter-btn');

async function fetchSaves() {
    try {
        const response = await fetch(`${API_URL}/saves`);
        const data = await response.json();
        saves = data;
        renderSaves();
    } catch (error) {
        console.error('Error fetching saves:', error);
        savesContainer.innerHTML = '<p class="empty-state">Error loading saves. Make sure backend is running.</p>';
    }
}

function renderSaves() {
    const filtered = currentFilter === 'all' ? saves : saves.filter(s => s.category === currentFilter);
    
    if (filtered.length === 0) {
        savesContainer.innerHTML = '<p class="empty-state">No saves yet. Text SaveBot to get started!</p>';
        return;
    }

    savesContainer.innerHTML = filtered.map(save => `
        <div class="save-card">
            <div class="save-title">${save.title || 'Untitled'}</div>
            <div class="save-category">📌 ${save.category}</div>
            <div class="save-description">${save.description || save.content || ''}</div>
        </div>
    `).join('');
}

filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderSaves();
    });
});

fetchSaves();

setInterval(fetchSaves, 5000);
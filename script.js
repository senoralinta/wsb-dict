const submitBtn = document.getElementById('submit-btn');
const entryInput = document.getElementById('new-entry-text');
const entryContainer = document.querySelector('.content');

submitBtn.addEventListener('click', function() {
    const message = entryInput.value;

    if (message.trim() !== "") {
        const newEntry = document.createElement('article');
        newEntry.className = 'entry';

        newEntry.innerHTML = `
            <p class="entry-text">${message}</p>
            <div class="entry-footer">
                <span class="author">you (guest)</span> - <span class="date">just now</span>
            </div>
        `;

        const createEntrySection = document.querySelector('.create-entry');
        entryContainer.insertBefore(newEntry, createEntrySection);

        entryInput.value = "";
    } else {
        alert("Please write something before sending!");
    }
});
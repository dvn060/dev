// Avatar customization state
let avatarState = {
  equipped: {},
  inventory: [],
  allItems: [],
  allPets: [],
  currentCategory: 'eyes'
};

// Check authentication
async function checkAuth() {
  try {
    const response = await fetch('/api/user');
    if (!response.ok) {
      window.location.href = '/';
      return null;
    }
    return await response.json();
  } catch (error) {
    window.location.href = '/';
    return null;
  }
}

// Initialize avatar customization
async function init() {
  const user = await checkAuth();
  if (!user) return;

  document.getElementById('user-name').textContent = user.full_name;
  if (user.avatar) {
    document.getElementById('user-avatar').textContent = user.avatar;
  }

  // Load all data
  await Promise.all([
    loadEquippedItems(),
    loadInventory(),
    loadAllItems(),
    loadAllPets()
  ]);

  // Unlock starter items for new users
  if (avatarState.inventory.length === 0) {
    await unlockStarterItems();
    await loadInventory();
    await loadEquippedItems();
  }

  // Show initial category
  showCategory('eyes');

  // Update collection stats
  updateCollectionStats();
}

// Load equipped items
async function loadEquippedItems() {
  try {
    const response = await fetch('/api/equipped');
    const equipped = await response.json();

    avatarState.equipped = {};
    equipped.forEach(item => {
      avatarState.equipped[item.slot_type] = item;
    });

    updateAvatarDisplay();
  } catch (error) {
    console.error('Error loading equipped items:', error);
  }
}

// Load user inventory
async function loadInventory() {
  try {
    const response = await fetch('/api/inventory');
    avatarState.inventory = await response.json();
  } catch (error) {
    console.error('Error loading inventory:', error);
  }
}

// Load all available items
async function loadAllItems() {
  try {
    const response = await fetch('/api/avatar/items');
    avatarState.allItems = await response.json();
  } catch (error) {
    console.error('Error loading items:', error);
  }
}

// Load all available pets
async function loadAllPets() {
  try {
    const response = await fetch('/api/pets/all');
    avatarState.allPets = await response.json();
  } catch (error) {
    console.error('Error loading pets:', error);
  }
}

// Unlock starter items
async function unlockStarterItems() {
  try {
    await fetch('/api/unlock-starter-items', { method: 'POST' });
  } catch (error) {
    console.error('Error unlocking starter items:', error);
  }
}

// Update avatar display
function updateAvatarDisplay() {
  // Get user's base avatar from the database (stored in users table)
  fetch('/api/user').then(r => r.json()).then(user => {
    if (user.avatar) {
      document.getElementById('equipped-face').textContent = user.avatar;
    }
  });

  // Update background
  const background = avatarState.equipped.background;
  if (background && background.icon) {
    const bgEl = document.getElementById('equipped-background');
    bgEl.innerHTML = `<div style="font-size: 8em; opacity: 1;">${background.icon}</div>`;
    bgEl.style.opacity = '0.3';
  }

  // Update outfit (shown as icon in collection)
  const outfit = avatarState.equipped.outfit;
  const outfitEl = document.getElementById('equipped-outfit');
  if (outfit && outfit.icon) {
    outfitEl.textContent = outfit.icon;
    outfitEl.style.display = 'block';
  } else {
    outfitEl.style.display = 'none';
  }

  // Update accessory (shown as icon in collection)
  const accessory = avatarState.equipped.accessory;
  const accessoryEl = document.getElementById('equipped-accessory');
  if (accessory && accessory.icon) {
    accessoryEl.textContent = accessory.icon;
    accessoryEl.style.display = 'block';
  } else {
    accessoryEl.style.display = 'none';
  }

  // Update pet
  const pet = avatarState.equipped.active_pet;
  const petEl = document.getElementById('equipped-pet');
  if (pet && pet.icon) {
    petEl.textContent = pet.icon;
    petEl.style.display = 'block';
  } else {
    petEl.style.display = 'none';
  }
}

// Show category
function showCategory(category) {
  avatarState.currentCategory = category;

  // Update tab buttons
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    if (tab.textContent.toLowerCase().includes(category)) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Get items for this category
  let items = [];
  if (category === 'pet') {
    items = avatarState.allPets.map(pet => ({
      ...pet,
      category: 'pet',
      item_type: 'pet'
    }));
  } else {
    items = avatarState.allItems.filter(item => item.category === category);
  }

  // Display items
  const container = document.getElementById('items-container');
  container.innerHTML = '';

  items.forEach(item => {
    const isOwned = avatarState.inventory.some(inv =>
      (inv.item_type === 'avatar_item' && inv.item_id === item.id && category !== 'pet') ||
      (inv.item_type === 'pet' && inv.item_id === item.id && category === 'pet')
    );

    const isEquipped = category === 'pet'
      ? avatarState.equipped.active_pet?.item_id === item.id
      : avatarState.equipped[category]?.item_id === item.id;

    const rarityColors = {
      common: '#95a5a6',
      rare: '#3498db',
      epic: '#9b59b6',
      legendary: '#f39c12'
    };

    const card = document.createElement('div');
    card.className = 'badge-card';
    card.style.background = isOwned ? rarityColors[item.rarity] : '#e0e0e0';
    card.style.opacity = isOwned ? '1' : '0.5';
    card.style.cursor = isOwned ? 'pointer' : 'not-allowed';
    card.style.position = 'relative';

    if (isEquipped) {
      card.style.boxShadow = '0 0 20px rgba(255, 215, 0, 0.8)';
      card.style.border = '3px solid #ffd700';
    }

    card.innerHTML = `
      ${isEquipped ? '<div style="position: absolute; top: 5px; right: 5px; font-size: 1.5em;">✓</div>' : ''}
      <div class="badge-icon" style="font-size: 3em; ${isOwned ? '' : 'filter: grayscale(1);'}">${item.icon}</div>
      <div class="badge-name" style="font-size: 0.9em;">${item.name}</div>
      ${item.description ? `<div class="badge-description" style="font-size: 0.7em;">${item.description}</div>` : ''}
      ${!isOwned ? `<div style="font-size: 0.8em; margin-top: 5px;">🔒 Shop</div>` : ''}
    `;

    if (isOwned) {
      card.onclick = () => equipItem(category, item);
    }

    container.appendChild(card);
  });

  if (items.length === 0) {
    container.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #999;">No items in this category yet!</p>';
  }
}

// Equip item
async function equipItem(category, item) {
  try {
    const slotType = category === 'pet' ? 'active_pet' : category;
    const itemType = category === 'pet' ? 'pet' : 'avatar_item';

    await fetch('/api/equip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slotType: slotType,
        itemId: item.id
      })
    });

    // Reload equipped items and update display
    await loadEquippedItems();
    showCategory(category);

    // Show success feedback
    showMessage(`${item.icon} ${item.name} equipped!`, 'success');
  } catch (error) {
    console.error('Error equipping item:', error);
    showMessage('Error equipping item', 'error');
  }
}

// Show message
function showMessage(text, type) {
  const message = document.createElement('div');
  message.style.position = 'fixed';
  message.style.top = '20px';
  message.style.right = '20px';
  message.style.padding = '20px 30px';
  message.style.borderRadius = '15px';
  message.style.fontSize = '1.2em';
  message.style.fontWeight = 'bold';
  message.style.zIndex = '10000';
  message.style.animation = 'slideIn 0.3s ease';
  message.textContent = text;

  if (type === 'success') {
    message.style.background = 'linear-gradient(135deg, #81FBB8 0%, #28C76F 100%)';
    message.style.color = 'white';
  } else {
    message.style.background = '#ff9a9e';
    message.style.color = '#d63031';
  }

  document.body.appendChild(message);

  setTimeout(() => {
    message.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => message.remove(), 300);
  }, 2000);
}

// Update collection statistics
function updateCollectionStats() {
  const totalItemsOwned = avatarState.inventory.filter(inv => inv.item_type === 'avatar_item').length;
  const totalPetsOwned = avatarState.inventory.filter(inv => inv.item_type === 'pet').length;

  const rareItems = avatarState.inventory.filter(inv => {
    if (inv.item_type === 'avatar_item') {
      const item = avatarState.allItems.find(i => i.id === inv.item_id);
      return item && (item.rarity === 'rare' || item.rarity === 'epic' || item.rarity === 'legendary');
    } else {
      const pet = avatarState.allPets.find(p => p.id === inv.item_id);
      return pet && (pet.rarity === 'rare' || pet.rarity === 'epic' || pet.rarity === 'legendary');
    }
  }).length;

  const totalAvailable = avatarState.allItems.length + avatarState.allPets.length;
  const totalOwned = avatarState.inventory.length;
  const collectionPercent = totalAvailable > 0 ? Math.round((totalOwned / totalAvailable) * 100) : 0;

  document.getElementById('total-items').textContent = totalItemsOwned;
  document.getElementById('total-pets').textContent = totalPetsOwned;
  document.getElementById('rare-items').textContent = rareItems;
  document.getElementById('collection-percent').textContent = collectionPercent + '%';
}

// Initialize
init();

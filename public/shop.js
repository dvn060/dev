// Shop state
let shopState = {
  allItems: [],
  allPets: [],
  inventory: [],
  progress: null,
  currentFilter: 'all',
  selectedItem: null
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

// Initialize shop
async function init() {
  const user = await checkAuth();
  if (!user) return;

  document.getElementById('user-name').textContent = user.full_name;
  if (user.avatar) {
    document.getElementById('user-avatar').textContent = user.avatar;
  }

  // Load all data
  await Promise.all([
    loadProgress(),
    loadAllItems(),
    loadAllPets(),
    loadInventory()
  ]);

  // Display shop
  filterShop('all');
}

// Load campaign progress
async function loadProgress() {
  try {
    const response = await fetch('/api/campaign/progress/math');
    shopState.progress = await response.json();

    document.getElementById('stars').textContent = shopState.progress.total_stars || 0;
    document.getElementById('coins').textContent = shopState.progress.coins || 0;
  } catch (error) {
    console.error('Error loading progress:', error);
  }
}

// Load all available items
async function loadAllItems() {
  try {
    const response = await fetch('/api/avatar/items');
    shopState.allItems = await response.json();
  } catch (error) {
    console.error('Error loading items:', error);
  }
}

// Load all available pets
async function loadAllPets() {
  try {
    const response = await fetch('/api/pets/all');
    shopState.allPets = await response.json();
  } catch (error) {
    console.error('Error loading pets:', error);
  }
}

// Load user inventory
async function loadInventory() {
  try {
    const response = await fetch('/api/inventory');
    shopState.inventory = await response.json();
  } catch (error) {
    console.error('Error loading inventory:', error);
  }
}

// Filter shop items
function filterShop(filter) {
  shopState.currentFilter = filter;

  // Update active tab
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => tab.classList.remove('active'));
  event.target.classList.add('active');

  // Combine all items and pets
  let allShopItems = [
    ...shopState.allItems.map(item => ({ ...item, item_type: 'avatar_item' })),
    ...shopState.allPets.map(pet => ({ ...pet, item_type: 'pet' }))
  ];

  // Apply filter
  let filteredItems = allShopItems;

  if (filter === 'avatar_item' || filter === 'pet') {
    filteredItems = allShopItems.filter(item => item.item_type === filter);
  } else if (filter === 'common' || filter === 'rare' || filter === 'epic' || filter === 'legendary') {
    filteredItems = allShopItems.filter(item => item.rarity === filter);
  } else if (filter === 'affordable') {
    filteredItems = allShopItems.filter(item => {
      if (item.unlock_type === 'coins') {
        return item.unlock_cost <= (shopState.progress?.coins || 0);
      } else if (item.unlock_type === 'stars') {
        return item.unlock_cost <= (shopState.progress?.total_stars || 0);
      }
      return true; // Level unlocks
    });
  }

  // Sort by unlock level, then by cost
  filteredItems.sort((a, b) => {
    if (a.unlock_level !== b.unlock_level) {
      return a.unlock_level - b.unlock_level;
    }
    return a.unlock_cost - b.unlock_cost;
  });

  // Display items
  displayShopItems(filteredItems);
}

// Display shop items
function displayShopItems(items) {
  const container = document.getElementById('shop-items');
  container.innerHTML = '';

  if (items.length === 0) {
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 60px; color: #999; font-size: 1.3em;">No items match your filter!</div>';
    return;
  }

  items.forEach(item => {
    const isOwned = shopState.inventory.some(inv =>
      inv.item_type === item.item_type && inv.item_id === item.id
    );

    const canAfford = item.unlock_type === 'level' ||
      (item.unlock_type === 'coins' && (shopState.progress?.coins || 0) >= item.unlock_cost) ||
      (item.unlock_type === 'stars' && (shopState.progress?.total_stars || 0) >= item.unlock_cost);

    const levelUnlocked = (shopState.progress?.current_level || 1) >= item.unlock_level;

    const rarityColors = {
      common: '#95a5a6',
      rare: '#3498db',
      epic: '#9b59b6',
      legendary: '#f39c12'
    };

    const card = document.createElement('div');
    card.style.background = 'white';
    card.style.padding = '25px';
    card.style.borderRadius = '20px';
    card.style.boxShadow = '0 5px 15px rgba(0,0,0,0.1)';
    card.style.textAlign = 'center';
    card.style.position = 'relative';
    card.style.transition = 'transform 0.3s';

    if (!isOwned && levelUnlocked) {
      card.style.cursor = 'pointer';
      card.onmouseover = () => card.style.transform = 'translateY(-5px)';
      card.onmouseout = () => card.style.transform = 'translateY(0)';
    }

    // Rarity badge
    const rarityBadge = document.createElement('div');
    rarityBadge.style.position = 'absolute';
    rarityBadge.style.top = '10px';
    rarityBadge.style.right = '10px';
    rarityBadge.style.background = rarityColors[item.rarity];
    rarityBadge.style.color = 'white';
    rarityBadge.style.padding = '5px 10px';
    rarityBadge.style.borderRadius = '10px';
    rarityBadge.style.fontSize = '0.8em';
    rarityBadge.style.fontWeight = 'bold';
    rarityBadge.style.textTransform = 'uppercase';
    rarityBadge.textContent = item.rarity;
    card.appendChild(rarityBadge);

    // Item icon
    const icon = document.createElement('div');
    icon.style.fontSize = '5em';
    icon.style.marginBottom = '15px';
    icon.style.filter = isOwned ? 'none' : (levelUnlocked ? 'none' : 'grayscale(1)');
    icon.textContent = item.icon;
    card.appendChild(icon);

    // Item name
    const name = document.createElement('h3');
    name.style.color = '#333';
    name.style.marginBottom = '10px';
    name.textContent = item.name;
    card.appendChild(name);

    // Item description (for pets)
    if (item.description) {
      const desc = document.createElement('p');
      desc.style.color = '#666';
      desc.style.fontSize = '0.9em';
      desc.style.marginBottom = '10px';
      desc.textContent = item.description;
      card.appendChild(desc);
    }

    // Special ability (for pets)
    if (item.special_ability) {
      const ability = document.createElement('div');
      ability.style.background = '#e8f5e9';
      ability.style.padding = '10px';
      ability.style.borderRadius = '10px';
      ability.style.marginBottom = '15px';
      ability.style.fontSize = '0.85em';
      ability.style.color = '#2e7d32';
      ability.innerHTML = `✨ ${item.special_ability}`;
      card.appendChild(ability);
    }

    // Cost/status
    const costDiv = document.createElement('div');
    costDiv.style.marginTop = '15px';

    if (isOwned) {
      costDiv.innerHTML = '<div style="background: #d4edda; color: #155724; padding: 12px; border-radius: 10px; font-weight: bold;">✓ Owned</div>';
    } else if (!levelUnlocked) {
      costDiv.innerHTML = `<div style="background: #f8d7da; color: #721c24; padding: 12px; border-radius: 10px; font-weight: bold;">🔒 Unlock at Level ${item.unlock_level}</div>`;
    } else if (item.unlock_type === 'level') {
      costDiv.innerHTML = '<div style="background: #cfe2ff; color: #084298; padding: 12px; border-radius: 10px; font-weight: bold;">🎁 Free!</div>';
    } else {
      const icon = item.unlock_type === 'coins' ? '🪙' : '⭐';
      const color = canAfford ? '#28a745' : '#dc3545';
      costDiv.innerHTML = `<div style="background: ${canAfford ? '#d4edda' : '#f8d7da'}; color: ${color}; padding: 12px; border-radius: 10px; font-weight: bold; font-size: 1.2em;">${icon} ${item.unlock_cost}</div>`;
    }

    card.appendChild(costDiv);

    // Buy button
    if (!isOwned && levelUnlocked) {
      const button = document.createElement('button');
      button.className = canAfford ? 'btn btn-success' : 'btn btn-secondary';
      button.style.width = '100%';
      button.style.marginTop = '15px';
      button.disabled = !canAfford;
      button.textContent = canAfford ? 'Buy Now!' : 'Not Enough Currency';

      if (canAfford) {
        button.onclick = () => showPurchaseModal(item);
      }

      card.appendChild(button);
    }

    container.appendChild(card);
  });
}

// Show purchase confirmation modal
function showPurchaseModal(item) {
  shopState.selectedItem = item;

  document.getElementById('modal-item-icon').textContent = item.icon;
  document.getElementById('modal-item-name').textContent = item.name;
  document.getElementById('modal-item-description').textContent = item.description || `A ${item.rarity} ${item.item_type === 'pet' ? 'pet' : 'item'} for your collection!`;

  const costIcon = item.unlock_type === 'coins' ? '🪙' : '⭐';
  document.getElementById('modal-cost-icon').textContent = costIcon;
  document.getElementById('modal-cost-amount').textContent = item.unlock_cost;

  document.getElementById('purchase-modal').style.display = 'flex';
}

// Close purchase modal
function closePurchaseModal() {
  document.getElementById('purchase-modal').style.display = 'none';
  shopState.selectedItem = null;
}

// Confirm purchase
async function confirmPurchase() {
  if (!shopState.selectedItem) return;

  const item = shopState.selectedItem;

  try {
    const response = await fetch('/api/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemType: item.item_type,
        itemId: item.id,
        cost: item.unlock_cost
      })
    });

    const data = await response.json();

    if (response.ok) {
      // Show success message
      showSuccessMessage(item);

      // Reload data
      await loadProgress();
      await loadInventory();

      // Refresh display
      closePurchaseModal();
      filterShop(shopState.currentFilter);

      // Confetti!
      confetti();
    } else {
      alert(data.error || 'Purchase failed');
    }
  } catch (error) {
    console.error('Error purchasing item:', error);
    alert('Error purchasing item');
  }
}

// Show success message
function showSuccessMessage(item) {
  const message = document.createElement('div');
  message.style.position = 'fixed';
  message.style.top = '50%';
  message.style.left = '50%';
  message.style.transform = 'translate(-50%, -50%)';
  message.style.background = 'linear-gradient(135deg, #81FBB8 0%, #28C76F 100%)';
  message.style.color = 'white';
  message.style.padding = '40px 60px';
  message.style.borderRadius = '20px';
  message.style.fontSize = '2em';
  message.style.fontWeight = 'bold';
  message.style.zIndex = '10001';
  message.style.textAlign = 'center';
  message.style.boxShadow = '0 10px 40px rgba(0,0,0,0.3)';
  message.style.animation = 'celebration 0.6s ease';

  message.innerHTML = `
    <div style="font-size: 3em; margin-bottom: 10px;">${item.icon}</div>
    <div>You Got ${item.name}!</div>
    <div style="font-size: 0.6em; margin-top: 10px; opacity: 0.9;">Check your avatar page to equip it!</div>
  `;

  document.body.appendChild(message);

  setTimeout(() => {
    message.style.animation = 'fadeOut 0.5s ease';
    setTimeout(() => message.remove(), 500);
  }, 3000);
}

// Confetti animation
function confetti() {
  const colors = ['#ff6b6b', '#f9ca24', '#6ab04c', '#4834d4', '#eb4d4b'];
  for (let i = 0; i < 50; i++) {
    setTimeout(() => {
      const confetti = document.createElement('div');
      confetti.style.position = 'fixed';
      confetti.style.width = '10px';
      confetti.style.height = '10px';
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.left = Math.random() * window.innerWidth + 'px';
      confetti.style.top = '-10px';
      confetti.style.borderRadius = '50%';
      confetti.style.zIndex = '10000';
      confetti.style.pointerEvents = 'none';
      document.body.appendChild(confetti);

      const animation = confetti.animate([
        { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
        { transform: `translateY(${window.innerHeight}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }
      ], {
        duration: 2000 + Math.random() * 1000,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
      });

      animation.onfinish = () => confetti.remove();
    }, i * 30);
  }
}

// Close modal on background click
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('purchase-modal');
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closePurchaseModal();
    }
  });
});

// Initialize
init();

const STORAGE_KEY = "pokemon-sticker-gacha:v1";
const FALLBACK_TOTAL_POKEMON = 1025;
const RARITY_TABLE = [
  { key: "legendary", label: "LEGENDARY", weight: 4 },
  { key: "epic", label: "EPIC", weight: 11 },
  { key: "rare", label: "RARE", weight: 25 },
  { key: "common", label: "COMMON", weight: 60 },
];

const state = {
  totalDraws: 0,
  collectedIds: [],
  recent: [],
  muted: false,
  totalPokemon: FALLBACK_TOTAL_POKEMON,
  busy: false,
  currentAudio: null,
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindElements();
  loadState();
  hydrateUi();
  bindEvents();
  await fetchPokemonCount();
  renderStats();
}

function bindElements() {
  els.stage = document.querySelector("#stage");
  els.gachaButton = document.querySelector("#gachaButton");
  els.stickerCard = document.querySelector("#stickerCard");
  els.stickerNumber = document.querySelector("#stickerNumber");
  els.stickerRarity = document.querySelector("#stickerRarity");
  els.pokemonImage = document.querySelector("#pokemonImage");
  els.pokemonName = document.querySelector("#pokemonName");
  els.pokemonTypes = document.querySelector("#pokemonTypes");
  els.pokemonHeight = document.querySelector("#pokemonHeight");
  els.pokemonWeight = document.querySelector("#pokemonWeight");
  els.recentList = document.querySelector("#recentList");
  els.totalDraws = document.querySelector("#totalDraws");
  els.uniqueCount = document.querySelector("#uniqueCount");
  els.collectionRate = document.querySelector("#collectionRate");
  els.dexCount = document.querySelector("#dexCount");
  els.statusText = document.querySelector("#statusText");
  els.muteToggle = document.querySelector("#muteToggle");
  els.cry = document.querySelector("#pokemonCry");
}

function bindEvents() {
  els.gachaButton.addEventListener("click", handleGacha);
  els.muteToggle.addEventListener("click", toggleMute);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const saved = JSON.parse(raw);
    state.totalDraws = Number(saved.totalDraws) || 0;
    state.collectedIds = Array.isArray(saved.collectedIds) ? saved.collectedIds : [];
    state.recent = Array.isArray(saved.recent) ? saved.recent.slice(0, 10) : [];
    state.muted = Boolean(saved.muted);
  } catch {
    // Ignore broken storage and continue with defaults.
  }
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        totalDraws: state.totalDraws,
        collectedIds: state.collectedIds,
        recent: state.recent,
        muted: state.muted,
      }),
    );
  } catch {
    // LocalStorage may be unavailable in private or restricted modes.
  }
}

function hydrateUi() {
  els.cry.muted = state.muted;
  els.muteToggle.setAttribute("aria-pressed", String(state.muted));
  els.muteToggle.textContent = state.muted ? "효과음 꺼짐" : "효과음 켜짐";
  renderRecent();
  renderStats();
}

async function fetchPokemonCount() {
  try {
    const response = await fetch("https://pokeapi.co/api/v2/pokemon?limit=1");
    const data = await response.json();
    if (Number.isFinite(data?.count)) {
      state.totalPokemon = data.count;
    }
  } catch {
    state.totalPokemon = FALLBACK_TOTAL_POKEMON;
  }
}

function toggleMute() {
  state.muted = !state.muted;
  els.cry.muted = state.muted;
  els.muteToggle.setAttribute("aria-pressed", String(state.muted));
  els.muteToggle.textContent = state.muted ? "효과음 꺼짐" : "효과음 켜짐";
  saveState();
}

async function handleGacha() {
  if (state.busy) return;

  state.busy = true;
  els.gachaButton.disabled = true;
  els.statusText.textContent = "포장지가 흔들리면서 찢어지고 있습니다...";
  els.stickerCard.hidden = true;
  els.stickerCard.classList.remove("is-visible");
  els.stage.classList.remove("is-opening", "is-rare", "is-epic", "is-legendary");

  const rarity = rollRarity();
  els.stage.classList.add("is-opening", `is-${rarity.key}`);

  try {
    const pokemonId = pickRandomPokemonId();
    const pokemonPromise = fetchPokemonDetail(pokemonId, rarity);
    await delay(1250);
    const pokemon = await pokemonPromise;

    renderSticker(pokemon);
    updateHistory(pokemon);
    renderRecent();
    renderStats();
    playCry(pokemon);
    els.statusText.textContent = `${pokemon.displayName}이(가) 등장했습니다.`;
    saveState();

    requestAnimationFrame(() => {
      els.stickerCard.hidden = false;
      requestAnimationFrame(() => {
        els.stickerCard.classList.add("is-visible");
      });
    });
  } catch (error) {
    console.error(error);
    els.statusText.textContent = "포켓몬 데이터를 불러오지 못했습니다. 다시 시도하세요.";
  } finally {
    window.setTimeout(() => {
      els.stage.classList.remove("is-opening", "is-rare", "is-epic", "is-legendary");
      els.gachaButton.disabled = false;
      state.busy = false;
    }, 1500);
  }
}

async function fetchPokemonDetail(id, rarity) {
  const [pokemonResponse, speciesResponse] = await Promise.all([
    fetch(`https://pokeapi.co/api/v2/pokemon/${id}`),
    fetch(`https://pokeapi.co/api/v2/pokemon-species/${id}`),
  ]);

  if (!pokemonResponse.ok || !speciesResponse.ok) {
    throw new Error("Failed to fetch Pokémon data");
  }

  const pokemon = await pokemonResponse.json();
  const species = await speciesResponse.json();
  const officialArtwork = pokemon.sprites?.other?.["official-artwork"]?.front_default;
  const fallbackImage = pokemon.sprites?.front_default || "";
  const image = officialArtwork || fallbackImage || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
  const koName = species.names?.find((entry) => entry.language?.name === "ko")?.name;

  return {
    id: pokemon.id,
    displayName: koName || capitalize(pokemon.name),
    name: pokemon.name,
    image,
    types: pokemon.types.map((entry) => capitalize(entry.type.name)),
    height: (pokemon.height / 10).toFixed(1),
    weight: (pokemon.weight / 10).toFixed(1),
    rarity,
    cry: pokemon.cries?.latest || pokemon.cries?.legacy || "",
  };
}

function renderSticker(pokemon) {
  els.stickerCard.dataset.rarity = pokemon.rarity.key;
  els.stickerNumber.textContent = `#${String(pokemon.id).padStart(3, "0")}`;
  els.stickerRarity.textContent = pokemon.rarity.label;
  els.pokemonImage.src = pokemon.image;
  els.pokemonImage.alt = `${pokemon.displayName} 이미지`;
  els.pokemonName.textContent = pokemon.displayName;
  els.pokemonTypes.textContent = `Type: ${pokemon.types.join(" / ")}`;
  els.pokemonHeight.textContent = `Height: ${pokemon.height}m`;
  els.pokemonWeight.textContent = `Weight: ${pokemon.weight}kg`;
}

function updateHistory(pokemon) {
  state.totalDraws += 1;

  if (!state.collectedIds.includes(pokemon.id)) {
    state.collectedIds.push(pokemon.id);
  }

  state.recent = [
    {
      id: pokemon.id,
      name: pokemon.displayName,
      image: pokemon.image,
    },
    ...state.recent.filter((entry) => entry.id !== pokemon.id),
  ].slice(0, 10);
}

function renderRecent() {
  if (!state.recent.length) {
    els.recentList.innerHTML = '<li class="empty-state">아직 획득한 띠부씰이 없습니다.</li>';
    return;
  }

  els.recentList.innerHTML = state.recent
    .map(
      (pokemon) => `
        <li class="recent-item">
          <img class="recent-thumb" src="${pokemon.image}" alt="${pokemon.name} 썸네일" />
          <div>
            <span class="recent-name">${pokemon.name}</span>
            <span class="recent-id">#${String(pokemon.id).padStart(3, "0")}</span>
          </div>
        </li>
      `,
    )
    .join("");
}

function renderStats() {
  const uniqueCount = new Set(state.collectedIds).size;
  const totalPokemon = state.totalPokemon || FALLBACK_TOTAL_POKEMON;
  const collectionRate = totalPokemon
    ? ((uniqueCount / totalPokemon) * 100).toFixed(1)
    : "0.0";

  els.totalDraws.textContent = `${state.totalDraws}회`;
  els.uniqueCount.textContent = `${uniqueCount}종`;
  els.collectionRate.textContent = `${collectionRate}%`;
  els.dexCount.textContent = `${totalPokemon.toLocaleString()}종`;
}

function playCry(pokemon) {
  if (!pokemon.cry) return;

  try {
    els.cry.pause();
    els.cry.currentTime = 0;
    els.cry.src = pokemon.cry;
    els.cry.muted = state.muted;
    const playResult = els.cry.play();

    if (playResult && typeof playResult.catch === "function") {
      playResult.catch(() => {
        // Autoplay can be blocked by some browsers; ignore and continue.
      });
    }
  } catch {
    // Audio playback should not block the reveal animation.
  }
}

function rollRarity() {
  const totalWeight = RARITY_TABLE.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.random() * totalWeight;

  for (const item of RARITY_TABLE) {
    cursor -= item.weight;
    if (cursor <= 0) return item;
  }

  return RARITY_TABLE[RARITY_TABLE.length - 1];
}

function pickRandomPokemonId() {
  return Math.floor(Math.random() * state.totalPokemon) + 1;
}

function capitalize(value) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

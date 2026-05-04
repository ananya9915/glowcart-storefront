const PRODUCTS_JSON_URL = "./products.json";
const METADATA_API_URL = "https://api.microlink.io?url=";
const THEME_STORAGE_KEY = "glowcart-theme";
const LOCAL_PREVIEW_CACHE_KEY = "glowcart-products-cache";

const state = {
  allProducts: [],
  visibleProducts: [],
  activeCategory: "All",
  searchTerm: "",
};

const productGrid = document.getElementById("product-grid");
const categoryFilters = document.getElementById("category-filters");
const searchInput = document.getElementById("search-input");
const loader = document.getElementById("loader");
const errorMessage = document.getElementById("error-message");
const previewHelper = document.getElementById("preview-helper");
const previewHelperCopy = document.getElementById("preview-helper-copy");
const loadJsonButton = document.getElementById("load-json-button");
const localJsonInput = document.getElementById("local-json-input");
const emptyState = document.getElementById("empty-state");
const resultsCount = document.getElementById("results-count");
const themeToggle = document.getElementById("theme-toggle");

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getSafeLink(link = "") {
  return /^https?:\/\//i.test(link) ? link : "#";
}

function createFallbackImage(title = "GlowCart Pick") {
  const safeTitle = String(title).trim().slice(0, 48) || "GlowCart Pick";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
      <defs>
        <linearGradient id="g" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="#ff8b7b"/>
          <stop offset="100%" stop-color="#ffc267"/>
        </linearGradient>
      </defs>
      <rect width="800" height="600" fill="#f7efe8"/>
      <circle cx="640" cy="110" r="110" fill="url(#g)" opacity="0.25"/>
      <circle cx="120" cy="510" r="140" fill="#ffd9a8" opacity="0.35"/>
      <text x="60" y="275" fill="#2b2237" font-family="Arial, sans-serif" font-size="44" font-weight="700">
        GlowCart
      </text>
      <text x="60" y="330" fill="#655c73" font-family="Arial, sans-serif" font-size="28">
        ${escapeHTML(safeTitle)}
      </text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function normalizeProduct(product) {
  return {
    title: String(product.title || "").trim(),
    description: String(product.description || "").trim(),
    image: String(product.image || "").trim(),
    link: String(product.link || "").trim(),
    category: String(product.category || "Uncategorized").trim(),
  };
}

function parseProductsPayload(payload) {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.products)
      ? payload.products
      : [];

  return source.map(normalizeProduct).filter((product) => product.title);
}

async function enrichProductsFromLinks(products) {
  const enrichedProducts = await Promise.all(
    products.map(async (product) => {
      const safeLink = getSafeLink(product.link);
      const needsMetadata = !product.image;

      if (!needsMetadata || safeLink === "#") {
        return product;
      }

      try {
        const response = await fetch(
          `${METADATA_API_URL}${encodeURIComponent(safeLink)}`,
          {
            headers: {
              Accept: "application/json",
            },
          }
        );

        if (!response.ok) {
          return product;
        }

        const payload = await response.json();
        const metadata = payload?.data || {};

        return {
          ...product,
          image:
            product.image ||
            metadata.image?.url ||
            metadata.image?.secure_url ||
            metadata.logo?.url ||
            "",
        };
      } catch (error) {
        console.warn("Metadata enrichment failed for:", product.link, error);
        return product;
      }
    })
  );

  return enrichedProducts;
}

function setLoading(isLoading) {
  loader.hidden = !isLoading;
}

function setError(message = "") {
  errorMessage.hidden = !message;
  errorMessage.textContent = message;
}

function setEmptyState(message = "") {
  emptyState.hidden = !message;
  emptyState.textContent = message;
}

function setPreviewHelper(visible, message = "") {
  previewHelper.hidden = !visible;

  if (message) {
    previewHelperCopy.innerHTML = message;
  }
}

function updateResultsCount(count) {
  resultsCount.textContent = `${count} product${count === 1 ? "" : "s"}`;
}

function getCategories(products) {
  const uniqueCategories = new Set(
    products
      .map((product) => product.category)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b))
  );

  return ["All", ...uniqueCategories];
}

function createProductCard(product) {
  const safeTitle = escapeHTML(product.title || "Untitled product");
  const safeDescription = escapeHTML(
    product.description || "No description available yet."
  );
  const safeCategory = escapeHTML(product.category || "Featured");
  const safeImage = escapeHTML(product.image || createFallbackImage(product.title));
  const safeLink = getSafeLink(product.link || "");

  return `
    <article class="product-card">
      <div class="product-card__media">
        <img
          src="${safeImage}"
          alt="${safeTitle || "Product image"}"
          loading="lazy"
        />
      </div>
      <div class="product-card__body">
        <span class="product-card__tag">${safeCategory}</span>
        <h3>${safeTitle}</h3>
        <p>${safeDescription}</p>
        <a
          class="product-card__button"
          href="${safeLink}"
          target="_blank"
          rel="noopener noreferrer"
          ${safeLink !== "#" ? "" : 'aria-disabled="true"'}
        >
          Buy Now
        </a>
      </div>
    </article>
  `;
}

function displayProducts(products) {
  state.visibleProducts = products;
  productGrid.innerHTML = products.map(createProductCard).join("");
  productGrid.querySelectorAll("img").forEach((image) => {
    image.addEventListener(
      "error",
      () => {
        image.src = createFallbackImage(image.alt);
      },
      { once: true }
    );
  });
  updateResultsCount(products.length);

  if (!products.length) {
    setEmptyState("No products matched your current filter or search.");
  } else {
    setEmptyState("");
  }
}

function renderProducts(products) {
  state.allProducts = products;

  if (!products.length) {
    renderCategoryFilters(["All"]);
    displayProducts([]);
    setEmptyState("No valid products were found in your catalog yet.");
    return;
  }

  setEmptyState("");
  renderCategoryFilters(getCategories(products));
  filterProducts("All");
}

function getCachedPreviewProducts() {
  try {
    const rawCache = localStorage.getItem(LOCAL_PREVIEW_CACHE_KEY);

    if (!rawCache) {
      return [];
    }

    const parsedCache = JSON.parse(rawCache);
    return parseProductsPayload(parsedCache);
  } catch (error) {
    console.warn("Could not read cached preview products:", error);
    return [];
  }
}

function cachePreviewProducts(products) {
  localStorage.setItem(LOCAL_PREVIEW_CACHE_KEY, JSON.stringify(products));
}

function renderCategoryFilters(categories) {
  categoryFilters.innerHTML = categories
    .map(
      (category) => `
        <button
          class="filter-btn ${category === state.activeCategory ? "is-active" : ""}"
          type="button"
          data-category="${category}"
        >
          ${category}
        </button>
      `
    )
    .join("");
}

function filterProducts(category = state.activeCategory) {
  state.activeCategory = category;
  const filteredByCategory =
    category === "All"
      ? state.allProducts
      : state.allProducts.filter((product) => product.category === category);

  const filteredProducts = filteredByCategory.filter((product) =>
    product.title.toLowerCase().includes(state.searchTerm.toLowerCase())
  );

  renderCategoryFilters(getCategories(state.allProducts));
  displayProducts(filteredProducts);
}

function searchProducts(searchTerm = "") {
  state.searchTerm = searchTerm.trim();
  filterProducts(state.activeCategory);
}

async function fetchProducts() {
  setLoading(true);
  setError("");
  setPreviewHelper(false);

  try {
    const response = await fetch(`${PRODUCTS_JSON_URL}?v=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}.`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      if (!Array.isArray(data?.products)) {
        throw new Error("Unexpected API response format.");
      }
    }

    const sanitizedProducts = parseProductsPayload(data);
    const enrichedProducts = await enrichProductsFromLinks(sanitizedProducts);
    renderProducts(enrichedProducts);
  } catch (error) {
    console.error("Product fetch failed:", error);

    if (location.protocol === "file:") {
      const cachedProducts = getCachedPreviewProducts();

      if (cachedProducts.length) {
        renderProducts(cachedProducts);
        setError(
          "Loaded cached local preview data. If you changed `products.json`, click `Load products.json` to refresh this preview."
        );
      } else {
        renderProducts([]);
        setError(
          "Your browser blocked automatic loading from `file://`, so the catalog cannot read `products.json` directly in this preview."
        );
      }

      setPreviewHelper(
        true,
        "Use <strong>Load products.json</strong> to preview your current catalog from this folder. GitHub Pages and normal web hosting will load <code>products.json</code> automatically."
      );
    } else {
      renderProducts([]);
      setError("Could not load `products.json`. Check that the file exists and contains valid JSON.");
    }
  } finally {
    setLoading(false);
  }
}

function handleLocalJsonSelection(event) {
  const [file] = event.target.files || [];

  if (!file) {
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const parsedData = JSON.parse(String(reader.result || "[]"));
      const products = parseProductsPayload(parsedData);

      cachePreviewProducts(products);
      setError("");
      setPreviewHelper(
        true,
        "Local preview is using the selected <code>products.json</code> file. Re-select it any time you update the catalog while staying in <code>file://</code> mode."
      );
      renderProducts(products);
    } catch (error) {
      console.error("Selected JSON file is invalid:", error);
      setError("The selected file could not be parsed. Make sure `products.json` contains valid JSON.");
    }
  };

  reader.readAsText(file);
  event.target.value = "";
}

function applySavedTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = savedTheme || (prefersDark ? "dark" : "light");
  document.body.classList.toggle("dark", theme === "dark");
}

function toggleTheme() {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem(THEME_STORAGE_KEY, isDark ? "dark" : "light");
}

function attachEventListeners() {
  categoryFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");

    if (!button) {
      return;
    }

    filterProducts(button.dataset.category);
  });

  searchInput.addEventListener("input", (event) => {
    searchProducts(event.target.value);
  });

  themeToggle.addEventListener("click", toggleTheme);
  loadJsonButton.addEventListener("click", () => {
    localJsonInput.click();
  });
  localJsonInput.addEventListener("change", handleLocalJsonSelection);
}

function init() {
  applySavedTheme();
  attachEventListeners();
  renderCategoryFilters(["All"]);
  fetchProducts();
}

init();

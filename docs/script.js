console.log("script");

const searchForm = document.querySelector("#searchForm");
const searchResult = document.querySelector("#searchResult");

searchForm.addEventListener("submit", searchFormHandler);

async function searchFormHandler(event) {
  event.preventDefault();
  console.log("searchFormHandler 확인");
  const search = getFormData(event).get("search");
  console.log("search", search);
  const pokeData = await getPokeData(search);
  console.log("pokeData", pokeData);
  drawPoke(pokeData);
}

function drawPoke(data) {
  console.log("drawPoke");
  console.log("searchResult", searchResult);
  searchResult.innerHTML = `
  <div style="text-align: center;">
    <img src="${data.sprites.front_default}">
    <h4>${data.koName}</h4>
    
    <p>도감번호 : ${data.id}</p>
    <p>영문이름 : ${data.name}</p>
    
    <audio src="${data.cries.latest}" controls></audio>
  </div>
  `;
}

function getFormData(event) {
  const formData = new FormData(event.target);
  console.log("formData", ...formData);
  return formData;
}

async function getPokeData(search) {
  console.log("getPokeData 확인");
  const apiURL = `https://pokeapi.co/api/v2/pokemon/${search}`;

  console.log("apiURL", apiURL);
  const response = await axios.get(apiURL);
  console.log("response", response);
  const data = response.data;
  console.log("data", data);
  const response2 = await axios.get(data.species.url);
  console.log("response2", response2);
  const koName = response2.data.names.find(
    (item) => item.language.name === "ko",
  ).name;
  console.log("koName", koName);
  data.koName = koName;
  return data;
}

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

let regionData;
let gdpClosest;
let spiClosest;
let cacheDistance;
let cacheNuts;
let cacheMap;

let slicedObject;


const urlParams = new URLSearchParams(window.location.search);
const regionName = urlParams.get('region');
const colors = ['#E6B800', '#0B39A2', '#00A174', '#FF8133', '#D7003D', '#B3F8FF'];


var crs3035 = new L.Proj.CRS('EPSG:3035',
    '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
    {
        resolutions: [8192, 4096, 2048, 1024, 512, 256],
        origin: [2000000, 1700000],
    }
);

var map = L.map('map', {
    crs: crs3035,
    minZoom: 0,
    maxZoom: 0,
    zoomControl: false, // Disables zoom buttons
    dragging: true, // Disables panning
    scrollWheelZoom: false, // Disables zooming with scroll
    doubleClickZoom: false, // Disables zooming on double-click
    touchZoom: false // Disables pinch zoom on touch devices});
});

map.setMaxBounds(L.latLngBounds(L.latLng(65, 92), L.latLng(25, -25)));

map.createPane('basePane');
map.getPane('basePane').style.zIndex = 100;
map.createPane('regionsPane');
map.getPane('regionsPane').style.zIndex = 101;
map.attributionControl.setPrefix(false);

async function fetchNutsMap() {
    if (!cacheMap) {
        const response = await fetch('data/nuts2_plus.geojson');
        cacheMap = await response.json();
    }
    return cacheMap;
};

function processNUTSdata() {
    fetchNutsMap().then(data => {
        const nuts2 = L.Proj.geoJson(data, {
            pane: 'regionsPane',
            style: (feature) => style(feature),
            onEachFeature,
        }).addTo(map);
    });
}

function style(feature) {
    if (feature.properties.NUTS_ID1 == regionName) {
        proj4.defs('EPSG:3035', '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs');
        const meters = [L.geoJSON(feature).getBounds().getCenter()];
        const latLng = proj4("EPSG:3035", "EPSG:4326", [Object.values(meters[0])[1], Object.values(meters[0])[0]]);
        map.setView([latLng[1], latLng[0]], 0);

        return {
            fillColor: '#FC0',
            weight: 1,
            opacity: 1,
            color: 'black',
            fillOpacity: 0.7
        };
    } else {
        return {
            fillColor: '#3E6CD5',
            weight: 1,
            opacity: 1,
            color: 'black',
            fillOpacity: 0.7
        };
    }
};

function onEachFeature(feature, layer) {
    layer.on('click', () => {
        window.location.href = 'regionPage3.html?region=' + encodeURIComponent(feature.properties.NUTS_ID1);
    });
}

processNUTSdata();

fetch('data/globalmap.geojson')
    .then(response => response.json())
    .then(data => {
        var style = {
            color: 'grey',
            weight: 1,
            fillOpacity: 0.2
        }
        var globalLayer = L.Proj.geoJson(data, { style: style, pane: 'basePane' }).addTo(map);
        globalLayer.bringToBack();
    });

async function fetchDistanceData() {
    if (!cacheDistance) { cacheDistance = await d3.csv("data/dist_matrix.csv"); }
    return cacheDistance;
}

async function fetchNutsData() {
    if (!cacheNuts) { cacheNuts = d3.csv("data/nuts_data.csv"); }
    return cacheNuts;
}

async function fetchMerge() {
    return fetch('data/merge.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .catch(error => console.error('Error:', error));
}

function extractRegions(clusterId, mergeMatrix) {
    if (clusterId < 0) {
        // If it's a region (negative ID), return its absolute value
        return [Math.abs(clusterId)];
    } else {
        // If it's a cluster, recursively explore its components
        const row = mergeMatrix[clusterId - 1]; // Adjust for 0-based indexing
        return [
            ...extractRegions(row[0], mergeMatrix),
            ...extractRegions(row[1], mergeMatrix),
        ];
    }
}

function findClosestRegions(regionId, mergeMatrix, distanceMatrix) {
    let searchValue = -regionId; // Start with the region as negative
    let mergedRegions = [];     // To store found regions

    for (let i = 0; i < mergeMatrix.length; i++) {
        if (mergeMatrix[i].includes(searchValue)) {
            // Identify the other element in the merge
            const otherValue = mergeMatrix[i].find(value => value !== searchValue);

            // Recursively extract regions from the other cluster or region
            const newRegions = extractRegions(otherValue, mergeMatrix);
            mergedRegions = [...new Set([...mergedRegions, ...newRegions])]; // Unique regions

            // Filter by distance if more than 5 regions are found
            if (mergedRegions.length > 5) {
                // Ensure `mergedRegions` is numeric
                mergedRegions = mergedRegions.map(Number);

                // Extract distances
                const distances = mergedRegions.map(region =>
                    distanceMatrix[regionId - 1][region - 1] // Adjust for 0-based indexing
                );

                // Debugging print statements
                console.log(
                    `Distances from region ${regionId} to merged regions:`,
                    distances
                );

                // Sort distances and select the closest regions
                const sortedIndices = distances
                    .map((distance, index) => ({ distance, index }))
                    .sort((a, b) => a.distance - b.distance)
                    .map(item => item.index);
                mergedRegions = sortedIndices
                    .slice(0, 5)
                    .map(index => mergedRegions[index]);
            }

            // Update searchValue to the current cluster
            searchValue = i + 1; // Adjust to match 1-based indexing of clusters

            // Stop if we have 5 or more regions
            if (mergedRegions.length >= 5) break;
        }
    }

    return mergedRegions; // Return the closest 5 regions
}


async function getClosestRegions(n) {
    return new Promise((resolve) => {
        Promise.all([fetchDistanceData(), fetchNutsData(), fetchMerge()]).then(([distanceData, nutsData, mergeData]) => {
            regionData = nutsData.filter(d => d.NUTS_ID1 === regionName);
            console.log(regionData[0][""]);
            spiClosest = findClosestRegions(regionData[0][""], mergeData, distanceData);
            console.log(spiClosest)
            gdpClosest = nutsData
                .map(({ gdp, NUTS_ID1 }) => ({ gdp: parseFloat(gdp), NUTS_ID1 }))
                .filter(({ NUTS_ID1 }) => NUTS_ID1 !== regionName)
                .map(({ gdp, NUTS_ID1 }) => ({
                    gdp,
                    NUTS_ID1,
                    diff: Math.abs(gdp - regionData[0]["gdp"]),
                }))
                .sort((a, b) => a.diff - b.diff)
                .slice(0, n);
            console.log(gdpClosest);

            resolve({ spiClosest, gdpClosest });
        });
    });
}

function updatePage() {
    if (regionData[0]["Country"] == "EL") {
        document.getElementById("countryFlag").src = `https://raw.githubusercontent.com/hampusborgos/country-flags/refs/heads/main/svg/gr.svg`
    } else {
        document.getElementById("countryFlag").src = `https://raw.githubusercontent.com/hampusborgos/country-flags/refs/heads/main/svg/${regionData[0]["Country"].toLowerCase()}.svg`
    }

    fetchNutsData().then(data => {
        const option = document.createElement("option");
        option.text = regionData[0]['Region name'];
        option.value = regionName;
        document.getElementById('regionName').add(option);

        const regionNames = data.map(row => ({
            'NUTS_ID1': row['NUTS_ID1'],
            'Region Name': row['Region name']
        }));

        regionNames.forEach(element => {
            const option = document.createElement("option");
            option.text = `${element["Region Name"]} (${element["NUTS_ID1"]})`
            option.value = element["NUTS_ID1"];
            document.getElementById('regionName').add(option);
        });

        document.getElementById('nutsId').textContent = regionName;

        spiClosest.forEach((region, index) => {
            const SPI = data[region - 1];
            console.log(region, index, SPI);
            if (SPI) {
                const rank = index + 1;
                document.getElementById(`SPI${rank}`).textContent = `${SPI["Region name"]} (${SPI["NUTS_ID1"]})`;
                document.getElementById(`SPI${rank}`).addEventListener('click', function () {
                    window.location.href = 'regionPage3.html?region=' + encodeURIComponent(SPI["NUTS_ID1"]);
                });
            } else {
                console.warn(`Region not found at index ${region["index"]}`);
            }

        });

        var dataSpiderChart = [spiderChartData(regionData[0], -1)];
        var dataBarChart = [barChartData(regionData[0], -1)];
        gdpClosest.forEach((region, index) => {
            const GDP = data.find(d => d["NUTS_ID1"] === region["NUTS_ID1"]);

            if (GDP) {
                const rank = index + 1; // To get the rank (1st, 2nd, etc.)
                document.getElementById(`GDP${rank}`).textContent = `${GDP["Region name"]} (${GDP["NUTS_ID1"]})`;
                document.getElementById(`GDP${rank}`).addEventListener('click', function () {
                    window.location.href = 'regionPage3.html?region=' + encodeURIComponent(GDP["NUTS_ID1"]);
                });
            } else {
                console.warn(`Region not found for code ${region["NUTS_ID1"]}`);
            }

            dataSpiderChart.push(spiderChartData(GDP, index));
            dataBarChart.push(barChartData(GDP, index));

        });
        const spiderLayout = {
            polar: {
                radialaxis: {
                    visible: true,
                    range: [0, 100] // Adjust range
                }
            },
            dragmod: false,
            title: {
                text: 'Spider chart with GDPpc peer regions',
                font: {
                    family: 'Merriweather',
                },
            },
            font: { family: 'Source Sans 3' },
            responsive: true,
        };

        const config = {
            staticPlot: false,
            autosize: true,
            displayModeBar: false,
        }

        Plotly.newPlot('spiderChart', dataSpiderChart, spiderLayout, config);

        const barLayout = {
            title: {
                text: 'Bar chart with GDPpc peer regions',
                font: {
                    family: 'Merriweather',
                },
            },
            font: { family: 'Source Sans 3' },
            barmode: 'group',
            showlegend: true,
            yaxis: {
                type: 'category',
                showticklabels: true,
                categoryorder: 'array',
                categoryarray: Object.keys(slicedObject).reverse(),
            },
            dragmode: false,
            margin: {
                l: 200,
            },
            responsive: true,
        };

        console.log(dataBarChart, barLayout);
        Plotly.newPlot('barChart', dataBarChart, barLayout, config);
    });
}

function spiderChartData(data, n) {
    const entries = Object.entries(data);
    const slicedEntries = entries.slice(4, 16);
    const slicedObject = Object.fromEntries(slicedEntries);

    const dataChart = {
        type: 'scatterpolar',
        r: Object.values(slicedObject),
        theta: Object.keys(slicedObject),
        fill: 'none', // Set fill to 'none' for no fill
        mode: 'lines+markers',
        name: data["Region name"] + " (" + data["Country"] + ")",
        line: {
            color: colors[n + 1], // Line color
            width: 2 // Line width
        },
        marker: {
            size: 10,
            color: colors[n + 1]
        },
        visible: (n + 1) > 1 ? 'legendonly' : true
    }
    console.log(dataChart);
    return dataChart;
}

function barChartData(data, n) {

    const entries = Object.entries(data);
    const slicedEntries = entries.slice(4, 16);
    slicedObject = Object.fromEntries(slicedEntries);

    const dataChart = {
        type: 'bar',
        x: Object.values(slicedObject),
        y: Object.keys(slicedObject),
        orientation: 'h',
        hovertext: Object.values(slicedObject),
        hoverinfo: 'text',
        name: data["Region name"],
        marker: {
            size: 10,
            color: colors[n + 1]
        },
        visible: (n + 1) > 1 ? 'legendonly' : true
    };

    return dataChart;
}

document.getElementById("spiderChartButton").addEventListener('click', function () {
    this.classList.add("selected");
    console.log(document.getElementById("spiderChart").style.display);
    document.getElementById("barChartButton").classList.remove("selected");
    document.getElementById("spiderChart").style.display = "block";
    Plotly.relayout("spiderChart", {
        width: document.getElementById("chartContainer").clientWidth,
        height: document.getElementById("chartContainer").clientHeight
    });
    document.getElementById("barChart").style.display = "none";
});

document.getElementById("barChartButton").addEventListener('click', function () {
    this.classList.add("selected");
    document.getElementById("spiderChartButton").classList.remove("selected");
    document.getElementById("barChart").style.display = "block";
    Plotly.relayout("barChart", {
        width: document.getElementById("chartContainer").clientWidth,
        height: document.getElementById("chartContainer").clientHeight
    });
    document.getElementById("spiderChart").style.display = "none";
});

$('#regionName').select2();
$('.select2-container .select2-selection--single').css({
    border: 'none',
});
$('.select2-container .select2-selection--single .select2-selection__rendered').css({
    lineHeight: '2.625rem',
    fontSize: '2.625rem',
    textWrap: 'balance',
    fontWeight: '700',
    color: 'black',
})
$('.select2-container .select2-selection__arrow').css({
    'background-image': 'url("assets/search-icon.png")',
    'background-size': 'contain',
    'background-repeat': 'no-repeat',
    'background-position': 'center'
});
$('.select2-container .select2-selection__arrow b').css('display', 'none');
$('#regionName').on('change', function () {
    window.location.href = 'regionPage3.html?region=' + encodeURIComponent(this.value);
});

getClosestRegions(5)
    .then(updatePage)

window.addEventListener("resize", () => {
    const spiderChart = document.getElementById('spiderChart');
    const barChart = document.getElementById('barChart');

    if (spiderChart && spiderChart.offsetParent !== null) {
        Plotly.Plots.resize('spiderChart');
    }

    if (barChart && barChart.offsetParent !== null) {
        Plotly.relayout("barChart", {
            width: document.getElementById("chartContainer").clientWidth,
            height: document.getElementById("chartContainer").clientHeight
        });
    }
});

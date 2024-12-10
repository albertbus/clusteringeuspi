import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";

let cacheNuts;
let cacheNutsCsv;
const colors = ['#08306b', '#08519c', '#2171b5', '#4292c6', '#6baed6', '#9ecae1', '#c6dbef', '#e5f5e0', '#a1d99b', '#31a354'];

var crs3035 = new L.Proj.CRS('EPSG:3035',
    '+proj=laea +lat_0=52 +lon_0=10 +x_0=4321000 +y_0=3210000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs',
    {
        resolutions: [8192, 4096, 2048, 1024, 512, 256],
        origin: [2000000, 1700000],
    }
);

var map = L.map('map', {
    crs: crs3035,
    center: [2000000, 1700000],
    zoomSnap: 0.25,
    zoom: 0.5,
    minZoom: 0.5,
});

map.fitBounds(L.latLngBounds(L.latLng(60, 68), L.latLng(32, -14)));
map.setMaxBounds(L.latLngBounds(L.latLng(60, 68), L.latLng(32, -14)));

map.createPane('basePane');
map.getPane('basePane').style.zIndex = 100;
map.createPane('regionsPane');
map.getPane('regionsPane').style.zIndex = 101;
map.attributionControl.setPrefix(false);

async function fetchNutsData() {
    if (!cacheNuts) {
        const response = await fetch('data/nuts2_plus.geojson');
        cacheNuts = await response.json();
    }
    return cacheNuts;
};

function processNUTSdata(selectedProperty) {
    fetchNutsData().then(data => {
        var deciles;
        selectedProperty == 'cluster' ?
            deciles = updateLegend(true) :
            deciles = updateLegend(false, data.features.map(feature => feature.properties[selectedProperty]));
        const nuts2 = L.Proj.geoJson(data, {
            pane: 'regionsPane',
            style: (feature) => style(feature, selectedProperty, deciles),
            onEachFeature,
        }).addTo(map);
    });
}

function updateLegend(categorical, values) {
    const legend = document.getElementById('legendMap');
    if (categorical) {
        legend.innerHTML = '';
        legend.innerHTML += `
                    <div id="firstColour" class="legendCat">
                        <div class="legendBox" style="background-color: #FE6162;"></div>
                        <p>Cluster 1</p>
                    </div>
    
                    <div id="secondColour" class="legendCat">
                        <div class="legendBox" style="background-color: #6467FE;"></div>
                        <p>Cluster 2</p>
                    </div>`;
    }
    else {
        const deciles = calculateDeciles(values);
        const roundDeciles = deciles.map(num => Number(num.toFixed(2)));
        legend.innerHTML = '';
        var firstColContent = '';
        var secondColContent = '';
        var thirdColContent = '';
        for (let i = 0; i < colors.length; i++) {
            const color = colors[i];
            const rangeText = i === 0
                ? `<${roundDeciles[i]}`
                : i === colors.length - 1
                    ? `>${roundDeciles[i - 1]}`
                    : `${roundDeciles[i - 1]} - ${roundDeciles[i]}`;

            const legendItem = `
                <div class="legendCat">
                    <div class="legendBox" style="background-color: ${color};"></div>
                    <p>${rangeText}</p>
                </div>`;

            if (i < 4) {
                firstColContent += legendItem;
            } else if (i < 7) {
                secondColContent += legendItem;
            } else {
                thirdColContent += legendItem;
            }
        }
        legend.innerHTML = `
        <div id="firstCol">${firstColContent}</div>
        <div id="secondCol">${secondColContent}</div>
        <div id="thirdCol">${thirdColContent}</div>`;

        return deciles;
    }
}

function calculateDeciles(data) {
    data.sort((a, b) => a - b);
    const deciles = [];
    for (let i = 1; i <= 10; i++) {
        const index = Math.floor((i / 10) * data.length) - 1;
        if (index >= 0 && index < data.length) {
            deciles.push(data[index]);
        } else {
            deciles.push(data[data.length - 1]);
        }
    }
    return deciles;

}

function style(feature, selectedProperty, deciles) {
    if (!deciles) {
        return {
            fillColor: feature.properties[selectedProperty] == 1 ? '#FE6162' : '#6467FE',
            weight: 1,
            opacity: 1,
            color: 'black',
            fillOpacity: 0.7
        };
    } else {
        return {
            fillColor: getColor(feature.properties[selectedProperty], deciles),
            weight: 1,
            opacity: 1,
            color: 'black',
            fillOpacity: 0.7
        };
    }
};

function getColor(property, deciles) {
    let color = colors.find((_, i) => property < deciles[i]) || colors[colors.length - 1];
    return color;
}

function onEachFeature(feature, layer) {
    layer.on('click', () => {
        updateChart(feature);

        // update Link
        document.getElementById('regionLink').textContent = `Detailed information for ${feature.properties.NUTS_ID1}`;
        document.getElementById('regionLink').addEventListener('click', function () {
            window.location.href = 'regionPage3.html?region=' + encodeURIComponent(feature.properties.NUTS_ID1);
        });
    });
}

function createChart(feature) {
    const properties = Object.keys(feature.properties).slice(4, 16)
    const propertyNames = properties.map(item => item.replace(/\./g, ' '));
    const selectedValues = properties.map(key => feature.properties[key]);

    const data = [{
        x: selectedValues.reverse(),
        y: propertyNames,
        type: 'bar',
        orientation: 'h',
        text: propertyNames,
        textposition: 'inside',
        insidetextanchor: 'middle',
        hovertext: selectedValues.map(num => parseFloat(num.toFixed(3))),
        hoverinfo: 'text'
    }];

    const layout = {
        font: { family: 'Source Sans 3' },
        plot_bgcolor: "rgba(0,0,0,0)",
        paper_bgcolor: "rgba(0,0,0,0)",
        showlegend: false,
        margin: {
            l: 0,
            r: 0,
            b: 20,
            t: 0
        },
        yaxis: {
            type: 'category',
            categoryorder: 'array',
            categoryarray: propertyNames.reverse(),
            showticklabels: false,
        },
        dragmode: false,
        responsive: true,
    };

    const config = {
        staticPlot: false,
        autosize: true,
        displayModeBar: false,
    }

    Plotly.newPlot('barChartRegion', data, layout, config);
}

function updateChart(feature) {
    const properties = Object.keys(feature.properties).slice(4, 16)
    const propertyNames = properties.map(item => item.replace(/\./g, ' '));
    const selectedValues = properties.map(key => feature.properties[key]);

    document.getElementById('barChartTitle').textContent = `Component values for ${feature.properties['Region.name']}`

    Plotly.update('barChartRegion', {
        x: [selectedValues],
        y: [propertyNames]
    }, {
        yaxis: {
            type: 'category',
            categoryorder: 'array',
            categoryarray: propertyNames.reverse(),
        },

    });
}

processNUTSdata('cluster');

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

document.getElementById('regionLink').addEventListener('click', function () {
    window.location.href = 'regionPage3.html?region=AT11'
})

document.getElementById('buttonRegCTA').addEventListener('click', function () {
    window.location.href = 'regionPage3.html?region=AT11'
})

fetchNutsData().then(data => {
    const firstFeature = data.features[0];
    createChart(firstFeature);
})

document.getElementById('selectCB').addEventListener('change', function () {
    fetchNutsData().then(data => {
        var deciles;

        this.value == 'cluster' ?
            deciles = updateLegend(true) :
            deciles = updateLegend(false, data.features.map(feature => feature.properties[this.value]));

        map.eachLayer(layer => {
            if (layer.options.pane == 'regionsPane' && !('_layers' in layer)) {
                layer.setStyle(style(layer.feature, this.value, deciles));
            }
        })
    })
});

d3.csv("data/cluster_mean.csv").then(data => {
    const components = data.map(row => row[""])
    const cluster1 = data.map(row => row["Cluster 1"]).map(Number);
    const cluster2 = data.map(row => row["Cluster 2"]).map(Number);

    const trace1 = {
        x: components,
        y: cluster1,
        type: 'bar',
        textposition: 'auto',
        hovertext: cluster1,
        hoverinfo: 'text',
        marker: { color: '#FE6162' },
        name: 'Cluster 1',
    };

    const trace2 = {
        x: components,
        y: cluster2,
        type: 'bar',
        textposition: 'auto',
        hovertext: cluster2,
        hoverinfo: 'text',
        marker: { color: '#6467FE' },
        name: 'Cluster 2',
    };

    const dataChart = [trace1, trace2];

    const layout = {
        plot_bgcolor: "rgba(0,0,0,0)",
        paper_bgcolor: "rgba(0,0,0,0)",
        font: { family: 'Source Sans 3' },
        margin: {
            b: 120,
            l: 20,
            r: 0,
        },
        dragmode: false,
        showlegend: false,
    };

    const config = {
        staticPlot: false,
        autosize: true,
        displayModeBar: false,
    }

    Plotly.newPlot('barChartCluster', dataChart, layout, config);
});

async function fetchNutsCsv() {
    if (!cacheNutsCsv) { cacheNutsCsv = d3.csv("data/nuts_data.csv"); }
    return cacheNutsCsv;
};

function createBoxPlot(property, propertyName) {
    fetchNutsCsv().then(data => {
        const cluster1 = data.filter(d => +d["cluster"] == 1);
        const cluster2 = data.filter(d => +d["cluster"] == 2);

        const values1 = cluster1.map(item => ({
            'Region name': item["Region name"],
            'NUTS_ID1': item["NUTS_ID1"],
            'component': item[property],
        }));

        const values2 = cluster2.map(item => ({
            'Region name': item["Region name"],
            'NUTS_ID1': item["NUTS_ID1"],
            'component': item[property],
        }));

        const trace1 = {
            y: values1.map(item => item["component"]),
            type: 'box',
            boxpoints: 'all',
            name: 'Cluster 1',
            jitter: 0.5,
            pointpos: -2,
            hoverinfo: 'text',
            hovertext: values1.map(item => `${item["Region name"]} (${item["NUTS_ID1"]})`),
            marker: { color: '#FE6162' },
        };

        const trace2 = {
            y: values2.map(item => item["component"]),
            type: 'box',
            boxpoints: 'all',
            jitter: 0.5,
            pointpos: -2,
            name: 'Cluster 2',
            hoverinfo: 'text',
            hovertext: values2.map(item => `${item["Region name"]} (${item["NUTS_ID1"]})`),
            marker: { color: '#6467FE' },
        };

        const dataChart = [trace1, trace2, {}, {}, {}, {}, {}];

        const layout = {
            plot_bgcolor: "rgba(0,0,0,0)",
            paper_bgcolor: "rgba(0,0,0,0)",
            font: { family: 'Source Sans 3' },
            dragmode: false,
            showlegend: false,
            responsive: true,
        };

        const config = {
            staticPlot: false,
            autosize: true,
            displayModeBar: false,
        };

        Plotly.newPlot("boxPlotCluster", dataChart, layout, config);
    });
};

createBoxPlot('ML1', 'Health (Factor 1)')

fetchNutsCsv().then(data => {
    const regionNames = data.map(row => ({
        'NUTS_ID1': row['NUTS_ID1'],
        'Region Name': row['Region name']
    }));

    regionNames.forEach(element => {
        const elements = ["highlightReg1", "highlightReg2", "highlightReg3", "highlightReg4", "highlightReg5"];
        elements.forEach(id => {
            const option = document.createElement("option");
            option.text = `${element["Region Name"]} (${element["NUTS_ID1"]})`
            option.value = element["Region Name"];
            document.getElementById(id).add(option);
        });
    });
});

document.getElementById('selectCB').addEventListener('change', function () {
    fetchNutsData().then(data => {
        var deciles;

        this.value == 'cluster' ?
            deciles = updateLegend(true) :
            deciles = updateLegend(false, data.features.map(feature => feature.properties[this.value]));

        map.eachLayer(layer => {
            if (layer.options.pane == 'regionsPane' && !('_layers' in layer)) {
                layer.setStyle(style(layer.feature, this.value, deciles));
            }
        })
    })
});

function updateBoxPlot(property, propertyName) {
    fetchNutsCsv().then(data => {
        const cluster1 = data.filter(d => +d["cluster"] == 1);
        const cluster2 = data.filter(d => +d["cluster"] == 2);

        const values1 = cluster1.map(item => ({
            'Region name': item["Region name"],
            'NUTS_ID1': item["NUTS_ID1"],
            'component': item[property],
        }));

        const values2 = cluster2.map(item => ({
            'Region name': item["Region name"],
            'NUTS_ID1': item["NUTS_ID1"],
            'component': item[property],
        }));

        Plotly.restyle('boxPlotCluster', {
            y: [values1.map(item => item["component"]), values2.map(item => item["component"])]
        }, [0, 1]);

        document.getElementById('boxPlotTitle').textContent = `Distribution of ${propertyName} by Cluster`;

        ['highlightReg1', 'highlightReg2', 'highlightReg3', 'highlightReg4', 'highlightReg5'].forEach((id, index) => {
            console.log(id, index);
            if (document.getElementById(id).value) {
                fetchNutsCsv().then(data => {
                    const dataRegion = data.map(row => ({
                        'NUTS_ID1': row['NUTS_ID1'],
                        'Region name': row['Region name'],
                        'cluster': row['cluster'],
                        'property': Number(row[document.getElementById('propertySelectBoxPlot').value])
                    }))
                        .find(item => item['Region name'] == document.getElementById(id).value);

                    console.log(dataRegion);
                    console.log(dataRegion.property);

                    Plotly.restyle('boxPlotCluster', {
                        y: [[dataRegion.property]],
                        name: `${dataRegion['Region name']} (${dataRegion.NUTS_ID1})`,
                        hoverinfo: 'text',
                        hovertext: `${dataRegion["Region name"]} (${dataRegion["NUTS_ID1"]}): ${dataRegion.property.toFixed(2)}`
                    }, [index + 2]);
                });
            };

        })
    });
}

document.getElementById('propertySelectBoxPlot').addEventListener('change', function () {
    updateBoxPlot(this.value, this.options[this.selectedIndex].text);
});

function highLightRegion(value, n) {
    const colors = ['#0B39A2', '#E6B800', '#00A174', '#FF8133', '#D7003D'];

    fetchNutsCsv().then(data => {
        const dataRegion = data.map(row => ({
            'NUTS_ID1': row['NUTS_ID1'],
            'Region name': row['Region name'],
            'cluster': row['cluster'],
            'property': Number(row[document.getElementById('propertySelectBoxPlot').value])
        }))
            .find(item => item['Region name'] == value);

        const highlightPoint = {
            x: [`Cluster ${dataRegion.cluster}`],
            y: [dataRegion.property],
            mode: 'markers',
            marker: {
                color: colors[n],
                size: 10,
                symbol: 'circle'
            },
            name: `${dataRegion['Region name']} (${dataRegion.NUTS_ID1})`,
            hoverinfo: 'text',
            hovertext: `${dataRegion["Region name"]} (${dataRegion["NUTS_ID1"]}): ${dataRegion.property.toFixed(2)}`,
            showlegend: false
        };

        Plotly.deleteTraces('boxPlotCluster', n + 2).then(() => {
            Plotly.addTraces('boxPlotCluster', highlightPoint, n + 2);
        });
    });

}

['highlightReg1', 'highlightReg2', 'highlightReg3', 'highlightReg4', 'highlightReg5'].forEach((id, index) => {
    $(`#${id}`).select2();
    $(`#${id}`).on('change', function () {
        this.value == "" ?
            Plotly.deleteTraces('boxPlotCluster', index + 2) :
            highLightRegion(this.value, index);
    });
});

function adjustHeight() {
    const vector1 = parseFloat(window.getComputedStyle(document.getElementById("vector1")).height);
    const vector2 = parseFloat(window.getComputedStyle(document.getElementById("vector2")).height);
    const section = parseFloat(window.getComputedStyle(document.getElementById("heroSection")).height);
    const targetElement = document.getElementById("heroBuffer");
    console.log(vector1, vector2, section)
    let targetHeight = section - ((vector1 * 0.75) + vector2);
    console.log(targetHeight)
    if (targetHeight < 0) { targetElement.style.height = 0 + "px"; }
    else { targetElement.style.height = (targetHeight + 20) + "px"; }

    document.getElementById("sectionBuffer").style.height = vector1 * 0.30 + "px";
}

// Run once on initiation
adjustHeight();

// Update on window resize
window.addEventListener("resize", () => {
    adjustHeight();
    Plotly.Plots.resize('barChartCluster');
    Plotly.Plots.resize('boxPlotCluster');
});



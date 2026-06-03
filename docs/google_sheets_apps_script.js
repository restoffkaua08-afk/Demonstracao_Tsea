const TSEA_SHARED_SECRET = "";

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");

    if (TSEA_SHARED_SECRET && payload.secret !== TSEA_SHARED_SECRET) {
      return jsonResponse({
        ok: false,
        error: "Segredo inválido."
      });
    }

    const title = payload.title || "Gráfico TSEA V-Twin";
    const metric = payload.metric || "indicador";
    const chartType = payload.chart_type || "bar";
    const period = payload.period || "all";
    const chartRows = Array.isArray(payload.chart_rows) ? payload.chart_rows : [];
    const fullRows = Array.isArray(payload.full_rows) ? payload.full_rows : [];

    if (!chartRows.length) {
      return jsonResponse({
        ok: false,
        error: "Nenhuma linha de dados recebida."
      });
    }

    const spreadsheet = SpreadsheetApp.create(title);
    const chartDataSheet = spreadsheet.getActiveSheet();

    chartDataSheet.setName("Dados_Grafico");
    chartDataSheet.getRange(1, 1, 1, 2).setValues([["Categoria", "Valor"]]);
    chartDataSheet.getRange(2, 1, chartRows.length, 2).setValues(
      chartRows.map((row) => [row.categoria, Number(row.valor) || 0])
    );

    chartDataSheet.getRange(1, 1, 1, 2)
      .setFontWeight("bold")
      .setBackground("#dbeafe")
      .setFontColor("#111827");

    chartDataSheet.autoResizeColumns(1, 2);

    const fullDataSheet = spreadsheet.insertSheet("Dados_Completos");

    writeObjectTable(fullDataSheet, fullRows.length ? fullRows : chartRows);

    const dashboardSheet = spreadsheet.insertSheet("Grafico");

    dashboardSheet.getRange("A1").setValue(title).setFontSize(18).setFontWeight("bold");
    dashboardSheet.getRange("A2").setValue("Indicador: " + metric);
    dashboardSheet.getRange("A3").setValue("Período: " + period);
    dashboardSheet.getRange("A4").setValue("Gerado em: " + new Date().toLocaleString("pt-BR"));
    dashboardSheet.getRange("A5").setValue("Fonte: " + (payload.source || "TSEA V-Twin"));

    const dataRange = chartDataSheet.getRange(1, 1, chartRows.length + 1, 2);
    const builder = dashboardSheet.newChart()
      .addRange(dataRange)
      .setPosition(7, 1, 0, 0)
      .setOption("title", title)
      .setOption("legend", { position: "right" })
      .setOption("hAxis", { title: "Categoria" })
      .setOption("vAxis", { title: "Valor" });

    if (chartType === "line") {
      builder.setChartType(Charts.ChartType.LINE);
    } else if (chartType === "pie") {
      builder.setChartType(Charts.ChartType.PIE);
    } else {
      builder.setChartType(Charts.ChartType.COLUMN);
    }

    dashboardSheet.insertChart(builder.build());
    spreadsheet.setActiveSheet(dashboardSheet);

    return jsonResponse({
      ok: true,
      spreadsheet_id: spreadsheet.getId(),
      spreadsheet_url: spreadsheet.getUrl(),
      rows_received: chartRows.length
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      error: String(error && error.stack ? error.stack : error)
    });
  }
}

function writeObjectTable(sheet, rows) {
  if (!rows.length) {
    sheet.getRange(1, 1).setValue("Sem dados.");
    return;
  }

  const headers = [];

  rows.forEach((row) => {
    Object.keys(row || {}).forEach((key) => {
      if (headers.indexOf(key) === -1) {
        headers.push(key);
      }
    });
  });

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1, rows.length, headers.length).setValues(
    rows.map((row) => headers.map((header) => row[header] !== undefined ? row[header] : ""))
  );

  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#dbeafe")
    .setFontColor("#111827");

  sheet.autoResizeColumns(1, headers.length);
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
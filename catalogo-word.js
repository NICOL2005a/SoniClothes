'use strict';

const {
 AlignmentType, BorderStyle, Document, HeadingLevel, ImageRun, Packer, Paragraph,
 Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType
} = require('docx');
const { imageSize } = require('image-size');

const formatoPrecio = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const anchos = [1960, 6320, 1800];

function fotoWord(foto, producto) {
 if (foto) {
  const data = Buffer.from(foto.contenido);
  const type = foto.mime === 'image/png' ? 'png' : 'jpg';
  let dimensiones;
  try { dimensiones = imageSize(data); } catch { /* La ficha sigue disponible aunque la foto esté dañada. */ }
  if (dimensiones?.width && dimensiones.height && dimensiones.type === type) {
   const { width, height } = dimensiones;
   const escala = Math.min(108 / width, 96 / height);
   const descripcion = `Foto de ${producto}`;
   return new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({
    data, type, altText: { title: descripcion, description: descripcion, name: descripcion },
    transformation: { width: Math.max(1, Math.round(width * escala)), height: Math.max(1, Math.round(height * escala)) }
   })] });
  }
 }
 return new Paragraph({ text: 'Sin foto', alignment: AlignmentType.CENTER });
}

function detalleVariantes(variantes) {
 const coloresPorTalla = new Map();
 for (const { talla, color } of variantes) {
  if (!coloresPorTalla.has(talla)) coloresPorTalla.set(talla, new Set());
  coloresPorTalla.get(talla).add(color);
 }
 return [...coloresPorTalla].map(([talla, colores]) => `${talla}: ${[...colores].join(', ')}`).join(' · ');
}

function tablaPrendas(prendas, fotos) {
 const borde = { style: BorderStyle.SINGLE, color: 'D9D9D9', size: 4 };
 const encabezado = new TableRow({ tableHeader: true, children: ['Foto', 'Prenda', 'Precio'].map((texto, i) => new TableCell({
  width: { size: anchos[i], type: WidthType.DXA },
  shading: { fill: 'F1F2EE' },
  children: [new Paragraph({
   alignment: [AlignmentType.CENTER, AlignmentType.LEFT, AlignmentType.RIGHT][i],
   children: [new TextRun({ text: texto, bold: true })]
  })]
 })) });
 const filas = prendas.map(variantes => {
  const { id_producto, producto, marca, precio_venta } = variantes[0];
  const columnas = [
   [fotoWord(fotos.get(String(id_producto)), producto)],
   [
    new Paragraph({ children: [new TextRun({ text: producto, bold: true, size: 23 })] }),
    new Paragraph({ text: marca || 'SoniClothes', spacing: { after: 55 } }),
    new Paragraph({ text: detalleVariantes(variantes) })
   ],
   [new Paragraph({ text: formatoPrecio.format(Number(precio_venta)), alignment: AlignmentType.RIGHT })]
  ];
  return new TableRow({ cantSplit: true, children: columnas.map((children, i) => new TableCell({
   width: { size: anchos[i], type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER, children
  })) });
 });
 return new Table({
  layout: TableLayoutType.FIXED,
  width: { size: 10080, type: WidthType.DXA },
  columnWidths: anchos,
  margins: { top: 100, bottom: 100, left: 140, right: 140 },
  borders: { top: borde, bottom: borde, left: borde, right: borde, insideHorizontal: borde, insideVertical: borde },
  rows: [encabezado, ...filas]
 });
}

function crearCatalogoWord(prendas, fotos) {
 const fotosPorPrenda = new Map(fotos.map(foto => [String(foto.id_producto), foto]));
 const categorias = new Map();
 for (const variantes of prendas) {
  const { categoria } = variantes[0];
  if (!categorias.has(categoria)) categorias.set(categoria, []);
  categorias.get(categoria).push(variantes);
 }
 const documento = new Document({
  title: 'Catálogo de prendas SoniClothes',
  styles: { default: {
   document: { run: { font: 'Calibri', size: 21, color: '242623' }, paragraph: { spacing: { after: 0 } } },
   title: { run: { font: 'Calibri', size: 52, bold: true, color: '000000' }, paragraph: { spacing: { after: 130 } } },
   heading1: { run: { font: 'Calibri', size: 30, bold: true, color: '000000' }, paragraph: { keepNext: true, spacing: { before: 280, after: 100 } } }
  } },
  sections: [{
   properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
   children: [
    new Paragraph({ text: 'Catálogo de prendas SoniClothes', heading: HeadingLevel.TITLE }),
    new Paragraph({ text: `${prendas.length} ${prendas.length === 1 ? 'prenda' : 'prendas'} · Precios en MXN` }),
    ...[...categorias].flatMap(([categoria, grupo]) => [
     new Paragraph({ text: categoria, heading: HeadingLevel.HEADING_1 }),
     tablaPrendas(grupo, fotosPorPrenda)
    ])
   ]
  }]
 });
 return Packer.toBuffer(documento);
}

module.exports = { crearCatalogoWord };

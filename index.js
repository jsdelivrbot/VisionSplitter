const PORT = 1337;

var express = require('express');
var fs = require('fs');
var util = require('util');
var mime = require('mime');
var multer = require('multer');
var upload = multer({dest: 'uploads/'});
var path = require('path');
var opn = require('opn');			                // Per aprire il browser
var Vision = require('@google-cloud/vision'); // Imports the Google Cloud client library
var util = require('util');
var jsonfile = require('jsonfile');
var parsing = require('./libs/parsing.js');

var app = express();
var vision = new Vision();                    // Creates a client
var levenshtein = require('./libs/fast-levenshtein-master/levenshtein.js');

const PIXEL_THRESHOLD = 5;
const Y_PRECISION =     10;
const JSON_FILE =       './assets/json/myjsonfile.json';
const DISCOUNT_DICT =   './assets/json/discount.json'
const LEVENSHTEIN =     2;
var MAX_TITLE_SIZE =    0;

// blabla
function base64Image(src) {
  var data = fs.readFileSync(src).toString('base64');
  return util.format('data:%s;base64,%s', mime.lookup(src), data);
}

// Controlla che la word ci stia (in altezza) nella row
function fits(word, row){
  if(Math.abs(row.average_y-word.y)< PIXEL_THRESHOLD)
    return true;
  else
    return false;
}

// Ricalcola da zero e aggiorna l'altezza media della row
function updateAverageHeight(row) {
  var sum = 0;
  var count = 0;
  for(var word of row.words) {
    sum += word.y;
    count++;
  }
  row.average_y = Math.round((sum / count) * Y_PRECISION) / Y_PRECISION;
}

// Controlla se la riga contiene uno sconto
function isDiscount(row){
  var found = false;
  for(var word of row.words){
    if(levenshtein.get(word.text.toUpperCase(),'SCONTO') < LEVENSHTEIN){
      found = true;
      break;
    }
  }
  /*
  fs.readFile(DISCOUNT_DICT, 'utf8', function readFileCallback(err, data){
    if (err){
      console.log(err);
    } else {
      var discountWords = JSON.parse(data);
      console.log(discountWords);
      for(var word of row.words){
        for(var discountWord of discountWords){
          if(word.text.toUpperCase() == discountWord.toUpperCase()){
            //console.log("è uno sconto: '"+word.text+"'");
            found = true;
            break;
          }
          else {
            //console.log("non è uno sconto: '"+word.text+"'");
          }
        }
        if(found) break;
      }
    }
  });
*/
  return found;
}

// Stampa a video il risultato finale e restituisce l'array per il front-end
function printRow(rows){
  var result = [];
  var counter = 0, firstRow = true;
  for(var row of rows){
    for(var word of row.words){
      counter += word.text.length + 1;
    }
    counter -= 1; //lo spazio extra alla fine
    if(counter > MAX_TITLE_SIZE) {
      MAX_TITLE_SIZE = counter;
    }
    counter = 0;
  }
  for(var row of rows){
    var titleLength = 0, title = "";
    process.stdout.write((firstRow?"\n":"")); firstRow = false;
    for(var i = 0; i < row.words.length; i++) {
      if(i == row.priceIndex){
        i += 2;
        //process.stdout.write("del del del ");
      }
      else {
        var partialTitle = row.words[i].text.toUpperCase() + (i == row.words.length?"":" ");
        titleLength += partialTitle.length;
        title += partialTitle;
        process.stdout.write(partialTitle);
      }
    }
    result.push({name: title, price: row.price});
    console.log("".padEnd(MAX_TITLE_SIZE-titleLength) + row.price);
  }
  return result;
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, 'views/index.html'));
});

app.post('/upload', upload.single('image'), function(req, res, next) { // Get the uploaded image, Image is uploaded to req.file.path
  // create an incoming form object
  var form = new formidable.IncomingForm();

  // specify that we want to allow the user to upload multiple files in a single request
  form.multiples = false;

  // store all uploads in the /uploads directory
  form.uploadDir = path.join(__dirname, '/uploads');

  // every time a file has been uploaded successfully,
  // rename it to it's orignal name
  form.on('file', function(field, file) {
    fs.rename(file.path, path.join(form.uploadDir, file.name));
  });

  // log any errors that occur
  form.on('error', function(err) {
    console.log('An error has occured: \n' + err);
  });

  // once all the files have been uploaded, send a response to the client
  form.on('end', function() {
    res.end('success');
  });

  // parse the incoming request containing the form data
  form.parse(req);

  vision.documentTextDetection({ source: { filename: req.file.path } })
    .then((results) => {
      res.write('<img width="500" src="' + base64Image(req.file.path) + '"><br>');

      // Salva ogni parola in formato stringa nel vettore words
      var words = [];
      for(var page of results[0].fullTextAnnotation.pages){
        for(var block of page.blocks){
          for(var paragraph of block.paragraphs){
            for(var word of paragraph.words){
              var wordString = { text: "" };
              for(var symbol of word.symbols){
                wordString.text += symbol.text;
              }
              wordString.y = symbol.boundingBox.vertices[2].y;
              words.push(wordString);
            }
          }
        }
      }

      // Inserisce in rows i vari array di parole opportune
      var rows = [], found;
      for(var word of words){
        found = false;
        for(var row of rows){
          if(fits(word, row)){
            found = true;
            row.words.push(word);
            updateAverageHeight(row);
            break;
          }
        }
        if(!found){
          var tmp = [];
          tmp.push(word);
          rows.push({
            words: tmp,
            average_y: word.y,
            isValid: false,
            price: null,
            priceIndex: null
          });
        }
      }

      // Setta isValid della row a 'true' in caso words contenga un prezzo
      for(var row of rows){
        var i = 0, whole, decimal, index = 0;
        for(var word of row.words){
          if(!isNaN(word.text)){  //se è un numero
            if (i == 0 || i == 1) {
              whole = word.text;
              i = 1;
            }
            if(i == 2){
              row.isValid = true;
              decimal = word.text;
              row.price = parseFloat(whole + "." + decimal);
              row.priceIndex = index - 2;
              break;  // da prestare attenzione ai casi con due prezzi per singolo words
            }
          }
          else if((word.text == "." || word.text == ",") && i == 1)
            i++;
          else
            i = 0;
          index++;
        }
      }

      // Accorpamento di nome e relativo prezzo in un singolo item dell'array mergedRows
      var mergedRows = [], i = 0,
      lastRow = {
          words: [],
          isValid: false,
          price: null,
          title: "",
        };
      for(var row of rows) {
        if (!row.isValid){
          lastRow = row;
          i = 1;
        }
        else if(i == 1 && row.isValid){ // è il caso di accorpare
          lastRow.priceIndex = row.priceIndex + lastRow.words.length;
          for(var word of row.words){
            lastRow.words.push(word);
          }
          lastRow.price = row.price;
          lastRow.isValid = true;
          mergedRows.push(lastRow);
          i = 0;
        }
        else if (row.isValid) {
          mergedRows.push(row);
        }
      }

      // Ordina le righe già accorpate in base all'altezza per riconoscere bene gli sconti
      mergedRows.sort(function(a, b) {
        return parseFloat(a.average_y) - parseFloat(b.average_y);
      });

      //Corregge i prezzi in caso rilevi sconto su riga inferiore
      var final = [], lastRow = (mergedRows.length!=0?mergedRows[0]:null);
      for(var i = 1; i < mergedRows.length; i++){
        if(isDiscount(mergedRows[i])) {
          lastRow.price = lastRow.price - Math.abs(mergedRows[i].price); //abs just in case
          final.push(lastRow);
          i++;
        }
        else {
          final.push(lastRow);
        }
        lastRow = mergedRows[i];
      }
      final.push(lastRow);

      //Controllo totale
      var total, found = false, i = 0;
      for(var row of final) {
        for(var word of row.words) {
          if (levenshtein.get(word.text.toUpperCase(),'TOTALE') < 2) {
              total = row.price;
              found = true;
          }
        }
        if (found) break;
        i++;
      }
      if (found)
        final = final.slice(0, i);

      //Controllo consistenza dati
      var json_export = printRow(final);

      module.exports = {
        foo: function () {
          return printRow(final);
        }
      };

      console.log(util.inspect(json_export, false, null));
      var checkSum = 0;
      for (var row of final) {
        checkSum = checkSum + row.price;
      }
      if (checkSum == total){
          console.log("TOTALE ".padEnd(MAX_TITLE_SIZE) + total);
      }
      else {
        console.log("TOTALE RICONOSCIUTO ".padEnd(MAX_TITLE_SIZE) + total);
        console.log("TOTALE CALCOLATO ".padEnd(MAX_TITLE_SIZE) + total);
        console.log("\nDati non consistenti");
      }

      /*
      // Debug completo
      console.log(util.inspect(final, false, null));
      */

      res.end('</body></html>');
    })
    .catch((err) => {
      console.error('ERROR:', err);
    });

});

console.log('Server running at http://localhost:'+PORT);
opn('http://localhost:'+PORT+'/');		//apre sul browser

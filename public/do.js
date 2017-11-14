function getRandomColor() {
    var letters = '8BCDE'.split('');
    var color = '#';
    for (var i = 0; i < 6; i++ ) {
        color += letters[Math.floor(Math.random() * letters.length)];
    }
    return color;
}

function Oggetto(name, price) {
    var self = this;
    self.name = name;
    self.price = price;
}

function Membro(name, color) {
    var self = this;
    self.name = name;
    self.color = color;
}

function OggettoViewModel() {
    var self = this;

    /* OGGETTO */

    // Editable data
    self.oggetti = ko.observableArray([]);

    // Operations
    self.addOggetto = function() {
        self.oggetti.push(new Oggetto("Nome prodotto", 0));
    }
    
    self.removeOggetto = function(oggetto) { self.oggetti.remove(oggetto) }

    /* MEMBRO 8===D */

    // Editable data
    self.membri = ko.observableArray([
        new Membro("King", getRandomColor())
    ]);

    // Operations
    self.addMembro = function() {
        self.membri.push(new Membro("Nome", getRandomColor()));
    }
    
    self.removeMembro = function(membro) { self.membri.remove(membro) }
}

ko.applyBindings(new OggettoViewModel());
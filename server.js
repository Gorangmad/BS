require('dotenv').config()

const axios = require ('axios')

const express = require ('express')

const app = express()

const ejs = require ('ejs')

const path = require ('path')

const expressLayout = require('express-ejs-layouts')

const PORT = process.env.PORT || 3400

const mongoose = require ('mongoose')

const session = require ('express-session')

const flash = require('express-flash')

const MongoDbStore = require('connect-mongo')

const nodemailer = require('nodemailer')

const passport = require('passport')

const Emitter = require('events')

const Order = require('./app/models/order')

const push = require('web-push')

const bodyParser = require('body-parser');

const QRCode = require('qrcode');

const { createCanvas } = require('canvas');

const { PDFDocument, rgb } = require('pdf-lib');

const fs = require('fs'); // Required for file reading

const PdfPrinter = require('pdfmake');



let userSubscription;

let vapidKeys = {
    publicKey: 'BHEk6XF74Wog4WnakolRs798bo9Sw0y5gj-5v9fnbRtmyXxXXlFQPWxhObZTp8ppqmtrheM6NUSrHKyNv_fqyAw',
    privateKey: '7PllFpyRJ1SqXb04v22tEat0J0AzvKRp77SVdjvN11A'
}

push.setVapidDetails(
    'mailto:ggorangmadaan@gmail.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

//Database connection

const url =`mongodb+srv://doadmin:${process.env.MONGO_SECRET}@db-mongodb-fra1-68366-638f76d0.mongo.ondigitalocean.com/BhaiBhaiSweets?tls=true&authSource=admin&replicaSet=db-mongodb-fra1-68366`;
mongoose.connect(url, {useNewUrlParser: true, useUnifiedTopology: true, family: 4});
const connection = mongoose.connection;
connection.once('open', () => {
    console.log ('Database connected....');
});

//Session config

app.use(session({
    secret: process.env.COOKIE_SECRET,
    resave: false,
    store: MongoDbStore.create({ mongoUrl:`mongodb+srv://doadmin:${process.env.MONGO_SECRET}@db-mongodb-fra1-68366-638f76d0.mongo.ondigitalocean.com/BhaiBhaiSweets?tls=true&authSource=admin&replicaSet=db-mongodb-fra1-68366`}),
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 } // One month
}))


// // Event emitter
const eventEmitter = new Emitter()
app.set('eventEmitter', eventEmitter)

//Passport config

const passportInit = require ('./app/config/passport')
const { Socket } = require('socket.io')
passportInit(passport)
app.use(passport.initialize())
app.use(passport.session())


//Assests
app.use(express.static('public'))

app.use(express.urlencoded( { extended: false }))

app.use(express.json())

app.use(bodyParser.json());

// Messaging

app.post('/subscribe', (req, res) => {
  const { endpoint, keys } = req.body;

  userSubscription ={
    endpoint,
    keys,
  };

  res.status(201).json({});
});




const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'nichtantwortenbb@gmail.com',
      pass: 'ahsyptlxsejgdyra'
    }
  });

//Global middleware
app.use((req, res, next) => {
    res.locals.session = req.session
    res.locals.user = req.user
    next()
})

app.get('/user', (req, res) => {
  // Retrieve the user information from the session or database
  const user = req.user; // Assuming the user information is stored in the `req.user` object
  // Return the user information as a response
  res.json(user);
});


app.use(flash())

//set template engine

app.use(expressLayout)

app.set('views', path.join(__dirname, '/resources/views'))

app.set('view engine', 'ejs')

app.get('/service-worker.js', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'service-worker.js'));
});



//Routes
require('./routes/web')(app)


const server = app.listen(PORT , () =>{
    console.log('listening on port 3400')
})

// Socket
const io = require('socket.io')(server);

io.on('connection', (socket) => {
    socket.on('join', (orderId) => {
      socket.join(orderId);
    });
});

eventEmitter.on('orderUpdated', async (data) => {
  io.to(`order_${data.id}`).emit('orderUpdated', data);

  if (data.status === 'completed') {

    const pushPayload = JSON.stringify({
      title: 'Order Completed',
      message: `Order ${data.id} has been completed.`,
      // You can add more data here as needed for your notification
    });

    let sub = {
        endpoint: userSubscription.endpoint,
        expirationTime: null,
        keys: userSubscription.keys,
      };
  
    push.sendNotification(sub, pushPayload)
    .then(() => {
      console.log('Push notification sent for order completion');
    })
    .catch((error) => {
      console.error('Error sending push notification:', error);
    });


    try {
      // Fetch the order details from the database based on the data.id
      const order = await Order.findById(data.id);


      // Check if the order exists
      if (!order) {
        console.log('Order not found');
        return;
      }

      const orderDetails = {
        orderId: order._id,
        Produkte: [],
      
        // Include other order details as needed
      };
      
      for (const itemId in order.items) {
        if (order.items.hasOwnProperty(itemId)) {
          const item = order.items[itemId];
          const itemName = item.pizza.name;
          const itemQty = item.qty;
      
          orderDetails.Produkte.push(itemName, itemQty);
        }
      }

      

      let emailBody = `Ihre Bestellung ${data.id} ist fertig und auf dem Weg zu`;
      Object.entries(orderDetails).forEach(([key, value]) => {
      emailBody += `Ihre Bestellung ist fertig und auf dem Weg zu ihnen`;
      });

      const mailOptions = {
        from: 'nichtantwortenbb@gmail.com',
        to: order.name,
        subject: 'Order Completed',
        text: emailBody,
      };

      transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
          console.log(error);
        } else {
          console.log('Email sent: ' + info.response);
        }
      });

    } catch (error) {
      console.log('Error fetching order details:', error);
    }
  }
});


// Usage example
eventEmitter.on('orderPlaced', async (data) => {
  io.to('adminRoom').emit('orderPlaced', data);

  const apiKey = process.env.NODE_API_KEY; // Replace with your actual API key

  const headers = {
    Authorization: `Basic ${Buffer.from(apiKey).toString('base64')}`,
  };

  try {
    // Fetch the order details from the database based on the data.id
    const order = await Order.findById(data.id);


    // Check if the order exists
    if (!order) {
      console.log('Order not found');
      return;
    }

    const orderDetails = {
      orderId: order._id,
      Produkte: [],
    
      // Include other order details as needed
    };
    
    for (const itemId in order.items) {
      if (order.items.hasOwnProperty(itemId)) {
        const item = order.items[itemId];
        const itemName = item.pizza.name;
        const itemQty = item.qty;
    
        orderDetails.Produkte.push(itemName, itemQty);
      }
    }

    

    let emailBody = `Ihre Bestellung ${data.id} wurde empfangen.\n\nOrder Details:\n`;
    Object.entries(orderDetails).forEach(([key, value]) => {
    emailBody += `Wir haben Ihre Bestellung erhalten`
    });

    const mailOptions = {
      from: 'nichtantwortenbb@gmail.com',
      to: order.name,
      subject: 'Order Placed',
      text: emailBody,
    };

    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        console.log(error);
      } else {
        console.log('Email sent: ' + info.response);
      }
    });


  } catch (error) {
    console.log('Error fetching order details:', error);
  }


  async function generateQRCode(id) {
    return new Promise((resolve, reject) => {
      const url = `https://starfish-app-nki4g.ondigitalocean.app/admin/orders/${id}`;
      QRCode.toDataURL(url, (err, dataURI) => {
        if (err) {
          reject(err);
        } else {
          resolve(dataURI);
        }
      });
    });
  }

async function generatePdfWithHeader(data) {
  const id = data._id.toHexString();

  // Generate the QR code
  const qrCode = await generateQRCode(id);
  const printer = new PdfPrinter({
    Roboto: {
      normal: './Roboto/Roboto-Regular.ttf',
      bold: './Roboto/Roboto-Medium.ttf',
      italics: './Roboto/Roboto-Italic.ttf',
      bolditalics: './Roboto/Roboto-MediumItalic.ttf',
    },
  });

    // Calculate the total quantities for each column
    const totalQuantities = Array(24).fill(0);
    (data.items || []).forEach((item) => {
      for (let i = 1; i <= 24; i++) {
        if (item.hasOwnProperty('quantity' + i)) {
          totalQuantities[i - 1] += item['quantity' + i];
        }
      }
    });

  const chunk = (array, size) =>
  Array.from({ length: Math.ceil(array.length / size) }, (v, i) =>
    array.slice(i * size, i * size + size)
  );


const filteredOrderNames = data.orderNames.filter(header => header !== 'Name geben');
const chunkedOrderNames = chunk(filteredOrderNames, 24);





const docDefinition = {
  pageSize: 'A4',
  pageMargins: [100, 20, 40, 60], // Adjust margins as needed
  pageOrientation: filteredOrderNames.length > 6 ? 'landscape' : 'portrait', // Set page orientation based on filteredOrderNames length

  content: [
    {
      columns: [
        { width: '*', text: '' }, // Left empty column for margin
        {
          margin: [0, 20, 0, 0],
          width: 'auto',
          image: qrCode,
          width: 30,
          height: 30,
          alignment: 'center'
        },
        {
          margin: [0, 20, 0, 0],
          width: 'auto',
          text: data.name,
          width: 200, // Adjusted width to fit on A5
          height: 5,
          alignment: 'center'
        },
        { width: '*', text: '' },
      ]
    },
    { width: '*', text: '' }, // Left empty column for margin
    ...chunkedOrderNames.map((chunk, chunkIndex) => {
      const previousChunkLength = chunkIndex > 0 ? chunkedOrderNames[chunkIndex - 1].length : 0;

      const widths = [55, ...Array(chunk.length).fill(20)];

      const rows = [
        [
          { text: 'Product', style: 'tableHeader' },
          ...chunk.map(header => ({ text: header, style: 'tableHeader' }))
        ],
        ...(data.items || []).map((items, index) => {
          const quantities = Object.values(items)
            .filter((value, i) => typeof value === 'number' && i >= previousChunkLength + 1 && i < chunk.length + previousChunkLength + 1)
            .map(value => (value === 0 ? '' : value.toString()));

          const rowStyle = index % 2 === 0 ? 'tableBody' : 'tableBodyGray';

          // Manually loop through the necessary length to populate the array
          const paddedQuantities = [];
          for (let i = 0; i < Math.min(chunk.length, Number.MAX_SAFE_INTEGER - 1); i++) {
            paddedQuantities.push(i < quantities.length ? quantities[i] : '');
          }

          const rowContent = [
            { text: items.pizza.name, style: rowStyle },
            ...paddedQuantities.map(quantity => ({ text: quantity, style: rowStyle })),
          ];
          return rowContent;
        })
      ];

      const chunkTable = {
        table: {
          headerRows: 1,
          height: 5,
          widths: widths,
          body: rows
        },
        pageBreak: chunkIndex < 4 ? 'after' : 'none', // Add page break for the first 4 chunks
      };


      return chunkTable;
    }),

  ],
  styles: {
    table:{
      alignment: 'center'
    },
    tableHeader: {
      bold: true,
      fontSize: 8,
      fillColor: '#CCCCCC',
      alignment: 'center'
    },
    tableBody: {
      fontSize: 8,
      alignment: "center"
    },
    tableBodyGray: {
      fontSize: 8,
      fillColor: '#F0F0F0',
      alignment: 'center'
    }
  }
};




  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  let chunks = [];

  return new Promise((resolve, reject) => {
    pdfDoc.on('data', (chunk) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    pdfDoc.pipe(fs.createWriteStream('document.pdf'));
    pdfDoc.end();
  });
}


  // Generate the PDF with a header
  generatePdfWithHeader(data)
    .then(pdfBase64 => {
      const printJobOptions = {
        printerId: 72568099, // Replace with the printer ID 
        title: 'Print Job Title',
        contentType: 'pdf_base64',
        content: pdfBase64, // Use the generated PDF with header
        };

      // Create the print job
      axios.post(`https://api.printnode.com/printjobs`, printJobOptions, { headers })
        .then(response => {
          console.log('Print job created:', response.data);
        })
        .catch(error => {
          console.error('Error creating print job:', error);
        });
    })
    .catch(err => {
      console.error('Error generating print job content:', err);
    });       
});








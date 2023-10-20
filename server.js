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

const url ='mongodb+srv://doadmin:5m20E4kM61Pq3s7R@db-mongodb-fra1-52094-5d3c473d.mongo.ondigitalocean.com/admin?tls=true&authSource=admin';
mongoose.connect(url, {useNewUrlParser: true, useUnifiedTopology: true, family: 4});
const connection = mongoose.connection;
connection.once('open', () => {
    console.log ('Database connected....');
});

//Session config

app.use(session({
    secret: process.env.COOKIE_SECRET,
    resave: false,
    store: MongoDbStore.create({ mongoUrl: 'mongodb+srv://doadmin:5m20E4kM61Pq3s7R@db-mongodb-fra1-52094-5d3c473d.mongo.ondigitalocean.com/admin?tls=true&authSource=admin'}),
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
      user: 'ggorangmadaan@gmail.com',
      pass: 'olbjpelutqeykilo'
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
        from: 'ggorangmadaan@gmail.com',
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
      from: 'ggorangmadaan@gmail.com',
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


  async function generateQRCode(data) {
    return new Promise((resolve, reject) => {
      const url = `https://starfish-app-nki4g.ondigitalocean.app/admin/orders/${data.id}`;
      QRCode.toDataURL(url, (err, dataURI) => {
        if (err) {
          reject(err);
        } else {
          resolve(dataURI);
        }
      });
    });
  }

  

  // async function generatePdfWithHeader(data) {
  //   const id = data._id.toHexString();
  
  //   // Generate the QR code
  //   const qrCode = await generateQRCode();
  
  //   // Create a new PDF document
  //   const pdfDoc = await PDFDocument.create();
  
  //   // Add a new page to the document
  //   const page = pdfDoc.addPage([400, 600]);
  
  //   // Draw text on the page
  //   page.drawText('Name: ' + data.name, {
  //     x: 30,
  //     y: 550,
  //     size: 15,
  //     color: rgb(0, 0, 0), // Black color
  //   });
  
  //   console.log(data.items)

  //   // Draw the table
  //   const table = [
  //     // Add headers
  //     ['Product', 'Quantity'],
  //     // Add rows for each product
  //     ...data.items.map((item) => [item.name, item.quantity]),
  //   ];
  
  //   page.drawTable(table, {
  //     x: 50,
  //     y: 500,
  //     font: await pdfDoc.embedFont('Helvetica'),
  //     fontSize: 12,
  //     color: rgb(0, 0, 0), // Black color
  //     borderColor: rgb(0, 0, 0), // Black color
  //     borderWidth: 1,
  //     drawHeaderRow: true,
  //   });
  
  //   // Embed the QR code as an image in the PDF
  //   const qrImage = await pdfDoc.embedPng(qrCode);
  //   const qrDims = qrImage.scale(0.2); // Adjust the scale as needed
  //   page.drawImage(qrImage, {
  //     x: 70,
  //     y: 70,
  //     width: qrDims.width,
  //     height: qrDims.height,
  //   });
  
  //   // Serialize the PDF to bytes
  //   const pdfBytes = await pdfDoc.save();
  
  //   // Encode the PDF content in base64
  //   const pdfBase64 = Buffer.from(pdfBytes).toString('base64');
  
  //   return pdfBase64;
  // }

  const PdfPrinter = require('pdfmake');

async function generatePdfWithHeader(data) {
  const id = data._id.toHexString();

  // Generate the QR code
  const qrCode = await generateQRCode();
  const printer = new PdfPrinter({
    Roboto: {
      normal: './Roboto/Roboto-Regular.ttf',
      bold: './Roboto/Roboto-Medium.ttf',
      italics: './Roboto/Roboto-Italic.ttf',
      bolditalics: './Roboto/Roboto-MediumItalic.ttf',
    },
  });

  const docDefinition = {
    pageSize: 'A5',
    content: [
      {
        columns: [
          {
            width: '*',
            text: 'Name: ' + data.name,
            fontSize: 8,
            margin: [0, 0, 0, 20]
          },
          {
            width: 'auto',
            image: qrCode,
            width: 40, // Adjust the width of the QR code as needed
            height: 40, // Adjust the height of the QR code as needed
          }
        ]
      },
      {
        
        table: {
          headerRows: 1,
          widths: [ '*', 'auto', 'auto', 'auto', 'auto', 'auto' ], // Adjust the widths of the table columns as needed
          body: [
            // Add headers
            [{ text: 'Product', style: 'tableHeader' }, { text: '11111', style: 'tableHeader' }, { text: '22222', style: 'tableHeader' }, { text: '33333', style: 'tableHeader' }, { text: '44444', style: 'tableHeader' }, { text: '55555', style: 'tableHeader' }],
            // Add rows for each product
            ...(data.items || []).map((items) => {
              const quantities = Object.values(items)
                .filter((value) => typeof value === 'number')
                .slice(0, 5) // Adjust the slice range to the number of quantities needed
                .map((value) => value.toString());
              return [{ text: items.pizza.name, style: 'tableBody' }, ...quantities.map(quantity => ({ text: quantity, style: 'tableBody' }))];
            }),
          ],
        },  
        styles: {
          table: {
            height:100,
            width:100
          },
          tableHeader: {
            bold: true,
            fontSize: 10, // Adjust the font size for the table headers
            fillColor: '#CCCCCC', // Adjust the background color for the table headers
            alignment: 'center'
          },
          tableBody: {
            fontSize: 9, // Adjust the font size for the table body
            alignment: 'center'
          }
        },
   
      },
    ],
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  let chunks = [];

  return new Promise((resolve, reject) => {
    pdfDoc.on('data', (chunk) => chunks.push(chunk));
    pdfDoc.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
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








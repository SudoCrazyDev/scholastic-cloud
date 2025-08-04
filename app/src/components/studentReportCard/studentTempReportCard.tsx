import { Page, Text, View, Document, PDFViewer } from '@react-pdf/renderer';

export default function PrintTempReportCard() {
    return (
        <PDFViewer className='w-full' style={{height: '600px'}}>
            <Document>
                <Page size="A5" orientation="landscape" style={{height: '100%', display: 'flex', flexDirection: 'row', justifyContent: 'center', fontFamily: 'Helvetica', flexWrap: 'wrap'}}>
                    <View style={{ width: '95%', alignContent: "center", display: 'flex', flexDirection: 'column', justifyContent: 'center', marginTop: '10px' }}>
                        <Text style={{ textTransform: 'uppercase', textAlign: 'center', fontSize: '13px' }}>SCHOOL NAME</Text>
                        <Text style={{ fontSize: '10px', textAlign: 'center' }}>School Address</Text>
                    </View>
                    <View style={{ paddingHorizontal: '20px', width: '100%', display: 'flex', flexDirection: 'row', marginTop: '5px'}}>
                        <Text style={{ textTransform: 'uppercase', fontFamily: 'Helvetica-Bold', fontSize: '12px'}}>STUDENT NAME</Text>
                        <Text style={{ marginLeft: 'auto', fontFamily: 'Helvetica-Bold', fontSize: '12px' }}>LRN: 123456789012</Text>
                    </View>
                    <View style={{width: '50%', paddingHorizontal: '20px', display: 'flex', flexDirection: 'column', marginTop: '5px'}}>
                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', marginBottom: '10px'}}>REPORT ON LEARNING PROGRESS AND ACHIEVEMENT</Text>
                        <View style={{display: 'flex', flexDirection: 'row', border: '1px solid black'}}>
                            <View style={{width: '30%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>Learning Areas</Text>
                            </View>
                            <View style={{width: '40%', display: 'flex', flexDirection: 'column', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>Quarter</Text>
                                <View style={{display: 'flex', flexDirection: 'row', borderTop: '1px solid black'}}>
                                    <View style={{width: '25%', borderRight: '1px solid black'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', textAlign: 'center'}}>1</Text>
                                    </View>
                                    <View style={{width: '25%', borderRight: '1px solid black'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', textAlign: 'center'}}>2</Text>
                                    </View>
                                    <View style={{width: '25%', borderRight: '1px solid black'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', textAlign: 'center'}}>3</Text>
                                    </View>
                                    <View style={{width: '25%'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', textAlign: 'center'}}>4</Text>
                                    </View>
                                </View>
                            </View>
                            <View style={{width: '10%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>Final Grade</Text>
                            </View>
                            <View style={{width: '20%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>Remarks</Text>
                            </View>
                        </View>

                        {/* Sample subject row */}
                        <View style={{display: 'flex', flexDirection: 'row', borderLeft: '1px solid black', borderRight: '1px solid black', borderBottom: '1px solid black'}}>
                            <View style={{paddingLeft: '2px', paddingVertical: '2px', width: '30%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'flex-start', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica'}}>Mathematics</Text>
                            </View>
                            <View style={{width: '40%', display: 'flex', flexDirection: 'row', borderRight: '1px solid black', alignItems: 'center', justifyContent: 'center'}}>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                    <Text>85</Text>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                    <Text>88</Text>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                    <Text>90</Text>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                    <Text>92</Text>
                                </View>
                            </View>
                            <View style={{width: '10%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>89</Text>
                            </View>
                            <View style={{width: '20%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>Passed</Text>
                            </View>
                        </View>

                        <View style={{display: 'flex', flexDirection: 'row', borderLeft: '1px solid black', borderRight: '1px solid black', borderBottom: '1px solid black'}}>
                            <View style={{width: '70%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', textAlign: 'center'}}>GENERAL AVERAGE</Text>
                            </View>
                            <View style={{width: '10%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>89</Text>
                            </View>
                            <View style={{width: '20%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>Passed</Text>
                            </View>
                        </View>
                            
                        <View style={{marginTop: '0', display: 'flex', flexDirection: 'row', flexWrap: 'wrap'}}>
                            <View style={{width: '40%'}}>
                                <Text style={{fontFamily: 'Helvetica-Bold', fontSize: '8px'}}>Descriptors</Text>
                            </View>
                            <View style={{width: '30%'}}>
                                <Text style={{fontFamily: 'Helvetica-Bold', fontSize: '8px'}}>Grading Scale</Text>
                            </View>
                            <View style={{width: '30%'}}>
                                <Text style={{fontFamily: 'Helvetica-Bold', fontSize: '8px'}}>Remarks</Text>
                            </View>
                            <View style={{width: '100%', display: 'flex', flexDirection: 'row', marginTop: '5px'}}>
                                <View style={{width: '40%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Outstanding</Text>
                                </View>
                                <View style={{width: '30%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>90-100</Text>
                                </View>
                                <View style={{width: '30%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Passed</Text>
                                </View>
                            </View>
                            <View style={{width: '100%', display: 'flex', flexDirection: 'row'}}>
                                <View style={{width: '40%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Very Satisfactory</Text>
                                </View>
                                <View style={{width: '30%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>85-89</Text>
                                </View>
                                <View style={{width: '30%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Passed</Text>
                                </View>
                            </View>
                            <View style={{width: '100%', display: 'flex', flexDirection: 'row'}}>
                                <View style={{width: '40%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Satisfactory</Text>
                                </View>
                                <View style={{width: '30%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>80-84</Text>
                                </View>
                                <View style={{width: '30%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Passed</Text>
                                </View>
                            </View>
                            <View style={{width: '100%', display: 'flex', flexDirection: 'row'}}>
                                <View style={{width: '40%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Fairly Satisfactory</Text>
                                </View>
                                <View style={{width: '30%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>75-79</Text>
                                </View>
                                <View style={{width: '30%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Passed</Text>
                                </View>
                            </View>
                            <View style={{width: '100%', display: 'flex', flexDirection: 'row'}}>
                                <View style={{width: '40%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Did Not Meet Expectations</Text>
                                </View>
                                <View style={{width: '30%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Below 75</Text>
                                </View>
                                <View style={{width: '30%'}}>
                                    <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Failed</Text>
                                </View>
                            </View>
                        </View>
                        <View style={{ display: 'flex', flexDirection: 'column', marginTop: '10px', marginBottom: '5px'}}>
                            <Text style={{ textTransform: 'uppercase', fontSize: '10px', fontFamily: 'Helvetica-Bold' }}>TEACHER NAME</Text>
                            <Text style={{ fontSize: '8px'}}>ADVISER</Text>
                        </View>
                    </View>
                    
                    <View style={{width: '50%', paddingHorizontal: '20px', display: 'flex', flexDirection: 'column', marginTop: '5px'}}>
                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', marginBottom: '10px'}}>REPORT ON LEARNER'S OBSERVED VALUES</Text>
                        <View style={{display: 'flex', flexDirection: 'row', border: '1px solid black'}}>
                            <View style={{width: '18%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>Core Values</Text>
                            </View>
                            <View style={{width: '42%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>Behavior Statements</Text>
                            </View>
                            <View style={{width: '40%', display: 'flex', flexDirection: 'column'}}>
                                <Text style={{fontSize: '8px', fontFamily: 'Helvetica', textAlign: 'center'}}>Quarter</Text>
                                <View style={{display: 'flex', flexDirection: 'row', borderTop: '1px solid black'}}>
                                    <View style={{width: '25%', borderRight: '1px solid black'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', textAlign: 'center'}}>1</Text>
                                    </View>
                                    <View style={{width: '25%', borderRight: '1px solid black'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', textAlign: 'center'}}>2</Text>
                                    </View>
                                    <View style={{width: '25%', borderRight: '1px solid black'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', textAlign: 'center'}}>3</Text>
                                    </View>
                                    <View style={{width: '25%'}}>
                                        <Text style={{fontSize: '8px', fontFamily: 'Helvetica-Bold', textAlign: 'center'}}>4</Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                        
                        <View style={{display: 'flex', flexDirection: 'row', borderLeft: '1px solid black', borderRight: '1px solid black', borderBottom: '1px solid black'}}>
                            <View style={{width: '18%', display: 'flex', flexDirection:'row', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <Text style={{fontSize: '7px', fontFamily: 'Helvetica', textAlign: 'center'}}>Maka-Diyos</Text>
                            </View>
                            <View style={{width: '42%', display: 'flex', flexDirection:'column', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid black'}}>
                                <View style={{height: '30px', borderBottom: '1px solid black'}}>
                                    <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                        Expresses one's spiritual beliefs while respecting the spiritual beliefs of others
                                    </Text>
                                </View>
                                <View>
                                    <Text style={{height: '25px', fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                        Show adherence to ethical principles by upholding truth
                                    </Text>
                                </View>
                            </View>
                            <View style={{width: '40%', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center'}}>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            AO
                                        </Text>
                                    </View>
                                    <View style={{width: '100%', height: '25px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            SO
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            AO
                                        </Text>
                                    </View>
                                    <View style={{width: '100%', height: '25px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            SO
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', borderRight: '1px solid black', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            AO
                                        </Text>
                                    </View>
                                    <View style={{width: '100%', height: '25px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            SO
                                        </Text>
                                    </View>
                                </View>
                                <View style={{height:'100%' ,fontSize: '8px', fontFamily: 'Helvetica', width: '25%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
                                    <View style={{width: '100%', height: '30px', borderBottom: '1px solid black', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            AO
                                        </Text>
                                    </View>
                                    <View style={{width: '100%', height: '25px', display: 'flex', flexDirection: 'column', justifyContent: 'center'}}>
                                        <Text style={{fontSize: '6px', fontFamily: 'Helvetica', textAlign: 'center', padding: '4px'}}>
                                            SO
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                        
                        <View style={{marginTop: '0', display: 'flex', flexDirection: 'column'}}>
                            <View style={{display: 'flex', flexDirection: 'row', paddingBottom: '5px'}}>
                                <Text style={{width: '20%', fontFamily: 'Helvetica-Bold', fontSize: '8px'}}>Marking</Text>
                                <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Non-numerical Rating</Text>
                            </View>
                            <View style={{display: 'flex', flexDirection: 'row'}}>
                                <Text style={{width: '20%', fontFamily: 'Helvetica', fontSize: '8px'}}>AO</Text>
                                <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Always Observed</Text>
                            </View>
                            <View style={{display: 'flex', flexDirection: 'row'}}>
                                <Text style={{width: '20%', fontFamily: 'Helvetica', fontSize: '8px'}}>SO</Text>
                                <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Sometimes Observed</Text>
                            </View>
                            <View style={{display: 'flex', flexDirection: 'row'}}>
                                <Text style={{width: '20%', fontFamily: 'Helvetica', fontSize: '8px'}}>RO</Text>
                                <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Rarely Observed</Text>
                            </View>
                            <View style={{display: 'flex', flexDirection: 'row'}}>
                                <Text style={{width: '20%', fontFamily: 'Helvetica', fontSize: '8px'}}>NO</Text>
                                <Text style={{fontFamily: 'Helvetica', fontSize: '8px'}}>Not Observed</Text>
                            </View>
                        </View>
                        
                    </View>
                </Page>
            </Document>
        </PDFViewer>
    );
}